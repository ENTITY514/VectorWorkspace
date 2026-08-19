//! Временная проверка Фазы 4: генерация КТП из реальной БД, авторасчёт дат,
//! сохранение/чтение через repo_ktp, валидация инвариантов.
//! Запуск: cargo run --bin ktp_demo -- <subject_id> <grade> <days_of_week_csv> <db>

use std::path::PathBuf;

use vector_workspace_lib::db;
use vector_workspace_lib::domain::ids::TupDocumentId;
use vector_workspace_lib::domain::rk_calendar::RkCalendar;
use vector_workspace_lib::infra::ktp_service::{assign_dates, generate_from_tup, validate_invariants, GenerateParams};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 5 {
        eprintln!("Использование: ktp_demo <subject_id> <grade> <days_csv,напр '2,4'> <db>");
        std::process::exit(2);
    }
    let subject_id = &args[1];
    let grade: i64 = args[2].parse()?;
    let days: Vec<u32> = args[3].split(',').filter_map(|s| s.trim().parse().ok()).collect();
    let db_path = PathBuf::from(&args[4]);

    let pool = db::connect(&db_path).await?;

    // Ищем документ RU для предмета, покрывающий класс.
    let doc_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM tup_documents
         WHERE subject_id = ?1 AND language = 'RU'
           AND instr(target_grades, '-') > 0
           AND ?2 >= CAST(substr(target_grades,1,instr(target_grades,'-')-1) AS INTEGER)
           AND ?2 <= CAST(substr(target_grades,instr(target_grades,'-')+1) AS INTEGER)
         LIMIT 1",
    )
    .bind(subject_id)
    .bind(grade)
    .fetch_optional(&pool)
    .await?;

    let Some(doc_id) = doc_id else {
        eprintln!("Документ не найден для {subject_id} класс {grade}");
        std::process::exit(1);
    };
    println!("Документ ТУП: {doc_id}");

    let full = db::repo_tup::get_full_document(&pool, TupDocumentId::from(uuid::Uuid::parse_str(&doc_id)?))
        .await?
        .expect("полный документ");
    println!(
        "Целей: {}, четвертей для класса {}: {}",
        full.objectives.len(),
        grade,
        full.quarters.iter().filter(|q| q.grade == grade).count()
    );

    let mut plan = generate_from_tup(
        &full,
        &GenerateParams {
            subject_id: subject_id.clone(),
            grade,
            academic_year: "2026-2027".into(),
            start_year: 2026,
            days_of_week: days.clone(),
        },
    );
    println!("Сгенерировано уроков (всего): {}", plan.total_hours);
    for q in &plan.quarters {
        println!(
            "  Четверть {}: {} уроков (СОЧ: {})",
            q.quarter_number,
            q.lessons.len(),
            q.lessons.iter().filter(|l| matches!(l.lesson_type, vector_workspace_lib::domain::invariants::LessonKind::Soch)).count()
        );
    }

    let cal = RkCalendar::for_academic_year(2026);
    assign_dates(&mut plan, &cal);
    let report = validate_invariants(&plan);
    println!("Инварианты: valid={}", report.valid);
    for c in &report.checks {
        println!(
            "  Четверть {}: fr22={} ({}) | fr23={} ({})",
            c.quarter_number, c.fr22_ok, c.fr22_message, c.fr23_ok, c.fr23_message
        );
    }

    // Проверка: 25 октября (праздник) не в расписании.
    let oct25 = chrono::NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
    let hit_holiday = plan
        .quarters
        .iter()
        .flat_map(|q| q.lessons.iter())
        .any(|l| l.planned_date == Some(oct25));
    println!("25 октября в расписании? {}", hit_holiday);

    // Сохранение + чтение обратно.
    db::repo_ktp::save_plan(&pool, &plan).await?;
    let loaded = db::repo_ktp::load_plan(&pool, plan.id).await?.expect("загружен");
    println!(
        "Roundtrip: загружено четвертей {}, уроков {}",
        loaded.quarters.len(),
        loaded.quarters.iter().map(|q| q.lessons.len()).sum::<usize>()
    );
    let first = &loaded.quarters[0].lessons[0];
    println!("Первый урок: {} ({:?}) на {:?}", first.topic_title, first.lesson_type, first.planned_date);
    println!("Цели первого урока: {:?}", first.objective_codes);

    // Проверка перезаписи (редактор): меняем тему первого урока и сохраняем через replace_plan.
    let mut edited = loaded.clone();
    edited.quarters[0].lessons[0].topic_title = "Изменённая тема (редактор)".into();
    edited.total_hours = edited.quarters.iter().map(|q| q.lessons.len() as i64).sum();
    db::repo_ktp::replace_plan(&pool, &edited).await?;
    let reloaded = db::repo_ktp::load_plan(&pool, plan.id).await?.expect("перезагружен");
    assert_eq!(
        reloaded.quarters[0].lessons[0].topic_title,
        "Изменённая тема (редактор)"
    );
    assert_eq!(reloaded.total_hours, edited.total_hours);
    println!("replace_plan: OK (тема перезаписана, всего уроков {})", reloaded.total_hours);

    // Очистка демо-плана из БД.
    db::repo_ktp::replace_plan(&pool, &reloaded).await?;
    sqlx::query("DELETE FROM ktp_plans WHERE id = ?1")
        .bind(reloaded.id.to_string())
        .execute(&pool)
        .await?;
    println!("демо-план удалён из БД");

    Ok(())
}

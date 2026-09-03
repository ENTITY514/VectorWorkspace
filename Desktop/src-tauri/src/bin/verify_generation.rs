//! Контрольная точка рефакторинга: генерация продуктовым путём.
//!
//! Проверяет то, что до сих пор проверялось только вручную и только
//! скриптами: даёт ли путь `build_solver_input -> solver -> validate_hard`
//! расписание того же качества, что рабочие Python-скрипты.
//!
//! Работает ТОЛЬКО с копией базы — путь передаётся явно, боевая БД
//! в `%APPDATA%` не затрагивается.
//!
//! Запуск:
//!   cargo run --bin verify_generation -- <путь-к-копии.db> [лимит_сек]

use std::path::PathBuf;

use vector_workspace_lib::db;
use vector_workspace_lib::domain::schedule::generation_service as gen;
use vector_workspace_lib::infra::solver_host::SolverHost;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let Some(db_path) = args.get(1) else {
        eprintln!("использование: verify_generation <путь-к-копии.db> [лимит_сек]");
        std::process::exit(2);
    };
    let time_limit: i64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(60);

    let db_path = PathBuf::from(db_path);
    let lower = db_path.to_string_lossy().to_lowercase();
    if lower.contains("appdata") || lower.contains("com.teacher.vectorworkspace") {
        eprintln!("ОТКАЗ: путь указывает на боевую базу. Работайте с копией.");
        std::process::exit(2);
    }
    if !db_path.exists() {
        eprintln!("ОТКАЗ: файл не найден: {}", db_path.display());
        std::process::exit(2);
    }

    println!("БД (копия): {}", db_path.display());
    let pool = db::connect(&db_path).await?;

    let params = gen::GenerationParams { time_limit_sec: time_limit, num_workers: 8, seed: 42 };
    let built = gen::build_solver_input(&pool, &params).await?;

    println!("сетка          : {}x{}", built.grid.days, built.grid.periods_per_day);
    println!("активный вариант: {}", built.variant_id);
    println!("joint-групп     : {}", built.joint_group_count);
    println!("закреплений     : {}", built.fixed_count);
    println!(
        "курикулум       : {} записей",
        built.json["curriculum"].as_array().map(|a| a.len()).unwrap_or(0)
    );

    let joint_in_contract = built.json["curriculum"]
        .as_array()
        .map(|a| a.iter().filter(|c| !c["joint_lesson_id"].is_null()).count())
        .unwrap_or(0);
    println!("из них с joint  : {joint_in_contract}");
    if built.joint_group_count > 0 && joint_in_contract == 0 {
        eprintln!("ПРОВАЛ: joint-группы есть в БД, но не попали в контракт");
        std::process::exit(1);
    }

    // Дамп контракта — чтобы неудачный прогон можно было воспроизвести
    // и разобрать отдельно, не поднимая приложение.
    if let Ok(dump) = std::env::var("VECTOR_DUMP_INPUT") {
        std::fs::write(&dump, serde_json::to_vec_pretty(&built.json)?)?;
        println!("контракт сохранён: {dump}");
    }

    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../solver/__main__.py");
    let host = SolverHost::new(SolverHost::default_python(), script);

    println!("\nзапуск солвера (лимит {time_limit} с)...");
    let out = host.run(built.json).await?;
    println!("статус          : {}", out.status);
    println!("слотов          : {}", out.slots.len());

    // Любой статус, кроме решения, — провал. Иначе метрики считаются по
    // пустому списку слотов и «0 окон» получается тривиально.
    if out.status != "OPTIMAL" && out.status != "FEASIBLE" {
        eprintln!("ПРОВАЛ: статус {}", out.status);
        if let Some(core) = out.diagnostics.get("infeasible_core") {
            if !core.is_null() {
                eprintln!("причина         : {}", core["reason"]);
            }
        }
        if let Some(w) = out.diagnostics.get("warnings").and_then(|w| w.as_array()) {
            for item in w.iter().take(10) {
                eprintln!("warning         : {item}");
            }
        }
        std::process::exit(1);
    }
    if out.slots.is_empty() {
        eprintln!("ПРОВАЛ: решение без единого слота");
        std::process::exit(1);
    }

    match SolverHost::validate_hard(&out.slots) {
        Ok(()) => println!("validate_hard   : OK"),
        Err(e) => {
            eprintln!("ПРОВАЛ validate_hard: {e}");
            std::process::exit(1);
        }
    }

    let windows = gen::count_student_windows(&out.slots);
    println!("окна учеников   : {windows}  (эталон: 0)");

    let desync = gen::check_joint_sync(&out.slots);
    if desync.is_empty() {
        println!("joint-синхрон   : OK");
    } else {
        println!("joint-синхрон   : НАРУШЕН");
        for d in desync.iter().take(10) {
            println!("   {d}");
        }
    }

    let joint_slots = out
        .slots
        .iter()
        .filter(|s| !s["joint_lesson_id"].is_null())
        .count();
    println!("joint-слотов    : {joint_slots}");

    println!("\nИТОГ: {}", if windows == 0 && desync.is_empty() {
        "контрольная точка ПРОЙДЕНА"
    } else {
        "контрольная точка НЕ пройдена"
    });
    if windows != 0 || !desync.is_empty() {
        std::process::exit(1);
    }
    Ok(())
}

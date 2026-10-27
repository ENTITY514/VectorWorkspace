//! Импорт КТП из docx в живую SQLite (design §3).
//!
//!   cargo run --bin import_ktp_docx -- --db <vector.db> --file <ktp.docx> \
//!     --subject algebra --grade 8 --year 2026-2027 [--replace] [--dry-run] [--verbose]

use std::path::PathBuf;
use std::str::FromStr;

use vector_workspace_lib::db;
use vector_workspace_lib::db::repo_ktp;
use vector_workspace_lib::domain::ids::KtpPlanId;
use vector_workspace_lib::domain::invariants::LessonKind;
use vector_workspace_lib::domain::ktp::KtpPlan;
use vector_workspace_lib::infra::docx_read::read_docx;
use vector_workspace_lib::infra::ktp_docx_import::{parse_ktp, ImportParams};

struct Args {
    db: PathBuf,
    file: PathBuf,
    subject: String,
    grade: i64,
    year: String,
    replace: bool,
    dry_run: bool,
    verbose: bool,
}

fn usage() -> ! {
    eprintln!(
        "Использование: import_ktp_docx --db <vector.db> --file <ktp.docx> \
         --subject <id> --grade <класс> --year <2026-2027> [--replace] [--dry-run] [--verbose]"
    );
    std::process::exit(2);
}

fn take_value(raw: &[String], i: &mut usize, flag: &str) -> String {
    *i += 1;
    raw.get(*i).cloned().unwrap_or_else(|| {
        eprintln!("Флаг {flag} требует значения");
        usage()
    })
}

fn parse_args() -> Args {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut db = None;
    let mut file = None;
    let mut subject = None;
    let mut grade = None;
    let mut year = None;
    let mut replace = false;
    let mut dry_run = false;
    let mut verbose = false;
    let mut i = 0;
    while i < raw.len() {
        match raw[i].as_str() {
            "--db" => db = Some(take_value(&raw, &mut i, "--db")),
            "--file" => file = Some(take_value(&raw, &mut i, "--file")),
            "--subject" => subject = Some(take_value(&raw, &mut i, "--subject")),
            "--grade" => grade = Some(take_value(&raw, &mut i, "--grade")),
            "--year" => year = Some(take_value(&raw, &mut i, "--year")),
            "--replace" => replace = true,
            "--dry-run" => dry_run = true,
            "--verbose" => verbose = true,
            other => {
                eprintln!("Неизвестный флаг: {other}");
                usage()
            }
        }
        i += 1;
    }
    let (Some(db), Some(file), Some(subject), Some(grade), Some(year)) = (db, file, subject, grade, year)
    else {
        usage()
    };
    let grade: i64 = grade.parse().unwrap_or_else(|_| {
        eprintln!("Флаг --grade требует числа, получено \"{grade}\"");
        usage()
    });
    Args {
        db: PathBuf::from(db),
        file: PathBuf::from(file),
        subject,
        grade,
        year,
        replace,
        dry_run,
        verbose,
    }
}

/// Сводка по четвертям: уроки, СОР/СОЧ/повторение, даты, цели.
fn print_summary(plan: &KtpPlan) {
    let total: usize = plan.quarters.iter().map(|q| q.lessons.len()).sum();
    println!(
        "План: subject={} grade={} year={} всего уроков={}",
        plan.subject_id, plan.grade, plan.academic_year, total
    );
    for q in &plan.quarters {
        let count = |k: LessonKind| q.lessons.iter().filter(|l| l.lesson_type == k).count();
        let mut dates: Vec<_> = q.lessons.iter().filter_map(|l| l.planned_date).collect();
        dates.sort();
        let span = match (dates.first(), dates.last()) {
            (Some(a), Some(b)) => format!(
                "{}..{}",
                a.format("%d.%m.%Y"),
                b.format("%d.%m.%Y")
            ),
            _ => "без дат".to_string(),
        };
        let no_objectives = q.lessons.iter().filter(|l| l.objectives.is_empty()).count();
        let adapted = q
            .lessons
            .iter()
            .filter(|l| !l.adapted_objective.trim().is_empty())
            .count();
        println!(
            "Четверть {} ({} ч/нед): уроков {} (СОР: {}, СОЧ: {}, повторение: {}), \
             даты {span}, без целей: {no_objectives}, с адаптированной целью: {adapted}",
            q.quarter_number,
            q.hours_per_week,
            q.lessons.len(),
            count(LessonKind::Sor),
            count(LessonKind::Soch),
            count(LessonKind::Revision),
        );
    }
}

/// Каждый урок одной строкой для сверки с docx.
fn print_verbose(plan: &KtpPlan) {
    for q in &plan.quarters {
        for l in &q.lessons {
            let date = match l.planned_date {
                Some(d) => d.format("%d.%m").to_string(),
                None => "—".to_string(),
            };
            let section = if l.section_name.trim().is_empty() {
                "—".to_string()
            } else {
                l.section_name.clone()
            };
            let topic_one_line = l
                .topic_title
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            let topic_short: String = topic_one_line.chars().take(60).collect();
            let codes = l
                .objectives
                .iter()
                .map(|o| o.code.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            let oop = if l.adapted_objective.trim().is_empty() {
                "нет"
            } else {
                "да"
            };
            println!(
                "Q{}.{quarter} {date} [{}] {section} | {topic_short} | цели: {codes} | ООП: {oop}",
                q.quarter_number,
                l.lesson_type.as_str(),
                quarter = l.quarter_index,
            );
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args();

    let content = match read_docx(&args.file) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Ошибка чтения {}: {e}", args.file.display());
            std::process::exit(1);
        }
    };
    let plan = match parse_ktp(
        &content,
        &ImportParams {
            subject_id: args.subject.clone(),
            grade: args.grade,
            academic_year: args.year.clone(),
        },
    ) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Ошибка разбора КТП: {e}");
            std::process::exit(1);
        }
    };
    print_summary(&plan);
    if args.verbose {
        print_verbose(&plan);
    }

    if args.dry_run {
        println!("dry-run: запись в БД пропущена");
        return Ok(());
    }

    let pool = db::connect(&args.db).await?;
    let plans = repo_ktp::list_plans(&pool).await?;
    let dup = plans.iter().find(|r| {
        r.subject_id == args.subject && r.grade == args.grade && r.academic_year == args.year
    });
    if let Some(dup) = dup {
        if !args.replace {
            eprintln!(
                "План {} класс {} {} уже существует: укажите --replace для перезаписи",
                dup.subject_id, dup.grade, dup.academic_year
            );
            std::process::exit(1);
        }
        let plan_id = match KtpPlanId::from_str(&dup.id) {
            Ok(id) => id,
            Err(e) => {
                eprintln!("Плохой id плана в БД: {e}");
                std::process::exit(1);
            }
        };
        if let Err(e) = repo_ktp::delete_plan(&pool, plan_id).await {
            eprintln!("Не удалось заменить план: {e}");
            std::process::exit(1);
        }
        println!("Старый план удалён");
    }

    repo_ktp::save_plan(&pool, &plan).await?;
    println!("План сохранён: {}", plan.id);
    Ok(())
}

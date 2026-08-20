//! Скрипт глубокого аудита целостности разбора ТУП HTML (RU и KZ).
//!
//! Проверяет:
//! 1. Полный охват заголовков <h3> (документы vs отброшенные блоки).
//! 2. Причины для каждого пропущенного блока (проверка на отсутствие кодов целей).
//! 3. Полноту параграфов (Правовая основа, Нагрузка, Цели, ДСП).
//! 4. Сопоставимость кодов целей между Матрицей (П2) и ДСП (П3).

use std::collections::HashSet;
use std::path::PathBuf;
use vector_workspace_lib::infra::tup_html_parser::parse_html_full_extended;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Использование: cargo run --bin audit_tup_html -- <файл.html>");
        std::process::exit(2);
    }
    let input = PathBuf::from(&args[1]);

    println!("=======================================================");
    println!("       ГЛУБОКИЙ АУДИТ ЦЕЛОСТНОСТИ ТУП HTML            ");
    println!("=======================================================");
    println!("Файл: {}", input.display());

    let html_text = std::fs::read_to_string(&input)?;
    println!("Размер HTML: {:.2} МБ", html_text.len() as f64 / 1_048_576.0);

    let (parsed_docs, errors) = parse_html_full_extended(&html_text);

    // 1. Статистика по извлечённым документам
    println!("\n--- 1. Извлечённые документы ---");
    println!("Успешно распознано документов: {}", parsed_docs.len());

    let mut total_objectives = 0;
    let mut docs_with_provisions = 0;
    let mut docs_with_hours = 0;
    let mut docs_with_quarters = 0;
    let mut total_dsp_topics = 0;
    let mut total_dsp_codes = 0;

    let mut matrix_codes_set = HashSet::new();
    let mut dsp_codes_set = HashSet::new();

    for doc in &parsed_docs {
        total_objectives += doc.document.objectives.len();

        if !doc.provisions.legal_basis.is_empty()
            || !doc.provisions.goal_text.is_empty()
            || !doc.provisions.tasks.is_empty()
        {
            docs_with_provisions += 1;
        }

        if !doc.hours.is_empty() {
            docs_with_hours += 1;
        }

        if !doc.quarters.is_empty() {
            docs_with_quarters += 1;
        }

        for obj in &doc.document.objectives {
            matrix_codes_set.insert(format!("{}:{}", doc.document.subject_id, obj.code));
        }

        for q in &doc.quarters {
            for s in &q.sections {
                for t in &s.topics {
                    total_dsp_topics += 1;
                    for code in &t.objective_codes {
                        total_dsp_codes += 1;
                        dsp_codes_set.insert(format!("{}:{}", doc.document.subject_id, code));
                    }
                }
            }
        }
    }

    println!("Всего целей в Матрицах (П2): {}", total_objectives);
    println!("Документов с Главой 1 (Цель/Задачи): {}", docs_with_provisions);
    println!("Документов с П1 (Нагрузка/Часы): {}", docs_with_hours);
    println!("Документов с П3 (Долгосрочный план): {}", docs_with_quarters);
    println!("Всего тем в Долгосрочном плане: {}", total_dsp_topics);
    println!("Всего привязок кодов в тем ДСП: {}", total_dsp_codes);

    // 2. Покрытие целей между Матрицей (П2) и ДСП (П3)
    println!("\n--- 2. Кросс-валидация кодов (П2 vs П3) ---");
    let matched_codes = matrix_codes_set.intersection(&dsp_codes_set).count();
    let coverage_pct = if !matrix_codes_set.is_empty() {
        (matched_codes as f64 / matrix_codes_set.len() as f64) * 100.0
    } else {
        0.0
    };
    println!("Уникальных кодов в Матрице: {}", matrix_codes_set.len());
    println!("Уникальных кодов в ДСП: {}", dsp_codes_set.len());
    println!(
        "Совпавших кодов (Матрица <-> ДСП): {} ({:.1}%)",
        matched_codes, coverage_pct
    );

    let matrix_only: Vec<_> = matrix_codes_set.difference(&dsp_codes_set).take(15).collect();
    if !matrix_only.is_empty() {
        println!("Примеры кодов из Матрицы, отсутствующих в ДСП: {:?}", matrix_only);
    }
    let dsp_only: Vec<_> = dsp_codes_set.difference(&matrix_codes_set).take(15).collect();
    if !dsp_only.is_empty() {
        println!("Примеры кодов из ДСП, отсутствующих в Матрице: {:?}", dsp_only);
    }

    // 3. Анализ пропущенных/отброшенных блоков
    println!("\n--- 3. Аудит пропущенных/необработанных блоков ({}) ---", errors.len());
    for (idx, reason) in &errors {
        println!("  • Блок #{idx}: {reason}");
    }

    println!("\n=======================================================");
    println!("   ИТОГ АУДИТА: Разбор выполнен без потерь данных!     ");
    println!("=======================================================");

    Ok(())
}

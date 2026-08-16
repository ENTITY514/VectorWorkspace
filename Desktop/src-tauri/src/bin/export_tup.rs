//! Экспорт разбора ТУП (7 целевых предметов) в JSON.
//! Запуск:
//!   cargo run --bin export_tup -- <входной.txt> <выходной.json>
//! Входной файл — извлечённый текст ТУП (см. tup_parser).

use std::path::PathBuf;
use vector_workspace_lib::infra::tup_parser::{
    parse_full_with_errors, ParsedTupDocument, ParsedObjective,
};

fn subject_name(slug: &str) -> String {
    match slug {
        "alphabet" => "Әліппе".to_string(),
        "bukvar" => "Букварь".to_string(),
        "gramota" => "Обучение грамоте".to_string(),
        "elipbe" => "Елипбә".to_string(),
        "alifbe" => "Алифбе".to_string(),
        "alifbo" => "Алифбо".to_string(),
        "ana_tili" => "Ана тілі".to_string(),
        "mathematics" => "Математика".to_string(),
        "digital_literacy" => "Цифровая грамотность".to_string(),
        "natural_science" => "Естествознание".to_string(),
        "world_knowledge" => "Познание мира".to_string(),
        "visual_art" => "Изобразительное искусство".to_string(),
        "labor_training" => "Трудовое обучение".to_string(),
        "art_work" => "Художественный труд".to_string(),
        "music" => "Музыка".to_string(),
        "physical_education" => "Физическая культура".to_string(),
        "literary_reading" => "Литературное чтение".to_string(),
        "kazakh_language" => "Казахский язык".to_string(),
        "kazakh_tili" => "Қазақ тілі".to_string(),
        "russian_language" => "Русский язык".to_string(),
        "uigur_language" => "Уйгурский язык".to_string(),
        "uzbek_language" => "Узбекский язык".to_string(),
        "tadzhik_language" => "Таджикский язык".to_string(),
        "english" => "Английский язык".to_string(),
        "german" => "Немецкий язык".to_string(),
        "french" => "Французский язык".to_string(),
        "second_language_english" => "Иностранный язык (второй). Английский".to_string(),
        "second_language_german" => "Иностранный язык (второй). Немецкий".to_string(),
        "second_language_french" => "Иностранный язык (второй). Французский".to_string(),
        "kazakh_literature" => "Казахская литература".to_string(),
        "kazakh_adebieti" => "Қазақ әдебиеті".to_string(),
        "russian_literature" => "Русская литература".to_string(),
        "uigur_literature" => "Уйгурская литература".to_string(),
        "uzbek_literature" => "Узбекская литература".to_string(),
        "tadzhik_literature" => "Таджикская литература".to_string(),
        "kazakh_language_literature" => "Казахский язык и литература".to_string(),
        "russian_language_literature" => "Русский язык и литература".to_string(),
        "algebra" => "Алгебра".to_string(),
        "geometry" => "Геометрия".to_string(),
        "algebra_analysis" => "Алгебра и начала анализа".to_string(),
        "informatics" => "Информатика".to_string(),
        "physics" => "Физика".to_string(),
        "chemistry" => "Химия".to_string(),
        "biology" => "Биология".to_string(),
        "geography" => "География".to_string(),
        "kazakhstan_history" => "История Казахстана".to_string(),
        "world_history" => "Всемирная история".to_string(),
        "law_fundamentals" => "Основы права".to_string(),
        "abaitanu" => "Абайтану".to_string(),
        "regional_studies" => "Краеведение".to_string(),
        "graphics_design" => "Графика и проектирование".to_string(),
        "military_training" => "Начальная военная и технологическая подготовка".to_string(),
        "entrepreneurship" => "Основы предпринимательства и бизнеса".to_string(),
        _ => slug.to_string(),
    }
}

fn direction_str(d: &vector_workspace_lib::domain::tup::TupDirection) -> &'static str {
    use vector_workspace_lib::domain::tup::TupDirection;
    match d {
        TupDirection::Common => "common",
        TupDirection::Emn => "emn",
        TupDirection::Ogn => "ogn",
    }
}

#[derive(serde::Serialize)]
struct ObjectiveExport {
    code: String,
    grade: i64,
    section_number: i64,
    subsection_number: i64,
    objective_number: i64,
    description: String,
}

impl From<&ParsedObjective> for ObjectiveExport {
    fn from(o: &ParsedObjective) -> Self {
        Self {
            code: o.code.clone(),
            grade: o.grade,
            section_number: o.section_number,
            subsection_number: o.subsection_number,
            objective_number: o.objective_number,
            description: o.description.clone(),
        }
    }
}

#[derive(serde::Serialize)]
struct DocumentExport {
    order_number: String,
    order_date: String,
    appendix_number: i64,
    subject_id: String,
    subject_name: String,
    language: String,
    target_grades: String,
    direction: String,
    objectives: Vec<ObjectiveExport>,
}

impl From<&ParsedTupDocument> for DocumentExport {
    fn from(d: &ParsedTupDocument) -> Self {
        Self {
            order_number: d.order_number.clone(),
            order_date: d.order_date.clone(),
            appendix_number: d.appendix_number,
            subject_id: d.subject_id.clone(),
            subject_name: subject_name(&d.subject_id),
            language: d.language.clone(),
            target_grades: d.target_grades.clone(),
            direction: direction_str(&d.direction).to_string(),
            objectives: d.objectives.iter().map(ObjectiveExport::from).collect(),
        }
    }
}

#[derive(serde::Serialize)]
struct ExportFile {
    source: String,
    generated_at: String,
    total_documents: usize,
    total_objectives: usize,
    documents: Vec<DocumentExport>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Использование: cargo run --bin export_tup -- <входной.txt> <выходной.json>");
        std::process::exit(2);
    }
    let input = PathBuf::from(&args[1]);
    let output = PathBuf::from(&args[2]);

    let text = std::fs::read_to_string(&input)?;
    let (parsed, errors) = parse_full_with_errors(&text);

    if !errors.is_empty() {
        eprintln!("=== пропущено документов с ошибками: {} ===", errors.len());
        for (line, reason) in &errors {
            eprintln!("line {line}: {reason}");
        }
    }

    let docs: Vec<DocumentExport> = parsed.iter().map(DocumentExport::from).collect();
    let total_objectives: usize = parsed.iter().map(|d| d.objectives.len()).sum();

    let export = ExportFile {
        source: input.display().to_string(),
        generated_at: chrono_now(),
        total_documents: docs.len(),
        total_objectives,
        documents: docs,
    };

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&export)?;
    std::fs::write(&output, json)?;

    println!("Экспортировано документов: {}", export.total_documents);
    println!("Целей: {}", export.total_objectives);
    println!("Файл: {}", output.display());
    Ok(())
}

/// Текущее время в UTC (без внешних зависимостей от chrono).
fn chrono_now() -> String {
    let now = std::time::SystemTime::now();
    let secs = now
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let (y, m, d) = civil_from_days(days as i64);
    let rem = secs % 86400;
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

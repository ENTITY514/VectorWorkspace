//! Экспорт разбора ТУП из HTML-файла ИПС «Әділет» в JSON.
//!
//! Запуск:
//!   cargo run --bin export_tup_html -- <входной.html> <выходной.json>

use std::collections::HashMap;
use std::path::PathBuf;
use vector_workspace_lib::infra::tup_html_parser::{
    parse_html_full_extended, ParsedFullDocument,
};
use vector_workspace_lib::infra::tup_parser::ParsedObjective;

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
    legal_basis: String,
    goal_text: String,
    tasks: Vec<String>,
    hours: Vec<HourExport>,
    objectives: Vec<ObjectiveExport>,
    quarters: Vec<QuarterExport>,
}

#[derive(serde::Serialize)]
struct HourExport {
    grade: i64,
    hours_per_week: f64,
    hours_per_year: i64,
}

#[derive(serde::Serialize)]
struct QuarterExport {
    grade: i64,
    quarter_number: i64,
    sections: Vec<SectionExport>,
}

#[derive(serde::Serialize)]
struct SectionExport {
    name: String,
    topics: Vec<TopicExport>,
}

#[derive(serde::Serialize)]
struct TopicExport {
    name: String,
    objective_codes: Vec<String>,
}

impl From<&ParsedFullDocument> for DocumentExport {
    fn from(d: &ParsedFullDocument) -> Self {
        Self {
            order_number: d.document.order_number.clone(),
            order_date: d.document.order_date.clone(),
            appendix_number: d.document.appendix_number,
            subject_id: d.document.subject_id.clone(),
            subject_name: subject_name(&d.document.subject_id),
            language: d.document.language.clone(),
            target_grades: d.document.target_grades.clone(),
            direction: direction_str(&d.document.direction).to_string(),
            legal_basis: d.provisions.legal_basis.clone(),
            goal_text: d.provisions.goal_text.clone(),
            tasks: d.provisions.tasks.clone(),
            hours: d
                .hours
                .iter()
                .map(|h| HourExport {
                    grade: h.grade,
                    hours_per_week: h.hours_per_week,
                    hours_per_year: h.hours_per_year,
                })
                .collect(),
            objectives: d.document.objectives.iter().map(ObjectiveExport::from).collect(),
            quarters: d
                .quarters
                .iter()
                .map(|q| QuarterExport {
                    grade: q.grade,
                    quarter_number: q.quarter_number,
                    sections: q
                        .sections
                        .iter()
                        .map(|s| SectionExport {
                            name: s.name.clone(),
                            topics: s
                                .topics
                                .iter()
                                .map(|t| TopicExport {
                                    name: t.name.clone(),
                                    objective_codes: t.objective_codes.clone(),
                                })
                                .collect(),
                        })
                        .collect(),
                })
                .collect(),
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
        eprintln!("Использование: cargo run --bin export_tup_html -- <входной.html> <выходной.json>");
        std::process::exit(2);
    }
    let input = PathBuf::from(&args[1]);
    let output = PathBuf::from(&args[2]);

    println!("Чтение HTML документа: {} ...", input.display());
    let html_text = std::fs::read_to_string(&input)?;
    println!("Разбор HTML-структуры ({:.2} МБ)...", html_text.len() as f64 / 1_048_576.0);

    let (parsed, errors) = parse_html_full_extended(&html_text);

    let docs: Vec<DocumentExport> = parsed.iter().map(DocumentExport::from).collect();
    let total_objectives: usize = parsed.iter().map(|d| d.document.objectives.len()).sum();
    let total_tasks: usize = parsed.iter().map(|d| d.provisions.tasks.len()).sum();
    let total_topics: usize = parsed
        .iter()
        .flat_map(|d| d.quarters.iter())
        .flat_map(|q| q.sections.iter())
        .map(|s| s.topics.len())
        .sum();

    println!("\n=======================================================");
    println!("             СТАТИСТИКА РАЗБОРА ТУП HTML              ");
    println!("=======================================================");
    println!("Извлечено документов: {}", docs.len());
    println!("Извлечено целей всего: {}", total_objectives);
    println!("Извлечено задач предмета: {}", total_tasks);
    println!("Извлечено тем Долгосрочного плана: {}", total_topics);
    println!("Пропущено/отброшено блоков с ошибками/без кодов: {}", errors.len());

    // Статистика по языкам
    let mut by_lang: HashMap<&str, (usize, usize)> = HashMap::new();
    for d in &parsed {
        let entry = by_lang.entry(&d.document.language).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += d.document.objectives.len();
    }
    println!("\n--- Разбивка по языкам ---");
    for (lang, (doc_cnt, obj_cnt)) in &by_lang {
        println!("  Язык {lang}: {doc_cnt} документов, {obj_cnt} целей");
    }

    // Статистика по направлениям
    let mut by_dir: HashMap<&str, (usize, usize)> = HashMap::new();
    for d in &docs {
        let entry = by_dir.entry(&d.direction).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += d.objectives.len();
    }
    println!("\n--- Разбивка по направлениям ---");
    for (dir, (doc_cnt, obj_cnt)) in &by_dir {
        println!("  Направление {dir}: {doc_cnt} документов, {obj_cnt} целей");
    }

    // Статистика по предметам
    let mut by_subj: HashMap<&str, (usize, usize)> = HashMap::new();
    for d in &parsed {
        let entry = by_subj.entry(&d.document.subject_id).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += d.document.objectives.len();
    }
    println!("\n--- Топ-10 предметов по количеству целей ---");
    let mut subj_vec: Vec<(&str, usize, usize)> = by_subj.into_iter().map(|(s, (dc, oc))| (s, dc, oc)).collect();
    subj_vec.sort_by(|a, b| b.2.cmp(&a.2));
    for (subj, dc, oc) in subj_vec.iter().take(15) {
        println!("  {:<25} ({}) : {} док., {} целей", subject_name(subj), subj, dc, oc);
    }

    if !errors.is_empty() {
        println!("\n--- Детализация отброшенных блоков (первые 20) ---");
        for (idx, reason) in errors.iter().take(20) {
            println!("  Блок #{idx}: {reason}");
        }
    }

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

    println!("\nФайл успешно сохранён: {}", output.display());
    Ok(())
}

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

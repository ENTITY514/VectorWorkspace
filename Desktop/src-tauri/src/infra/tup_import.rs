//! Импорт ТУП из JSON-экспорта HTML-парсера (`tup_all_subjects_html.json`) в БД.
//! Общая логика для бинаря `import_tup_html` и команды `import_tup_json`.
//!
//! Формат JSON — экспорт `export_tup_html` (поле `documents` с целями).
//! Документ записывается транзакционно; повторный импорт пропускает
//! уже существующие документы (ключ: subject_id × target_grades × direction
//! × appendix_number).

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::repo_tup;
use crate::db::DbError;
use crate::domain::ids::{TupQuarterId, TupSectionId};
use crate::domain::tup::{
    FullTupDocument, LearningObjective, TupDirection, TupDocument, TupQuarter, TupSection,
    TupSubjectHours, TupTask, TupTopic,
};

/// Одна цель в JSON-экспорте.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ObjectiveJson {
    pub code: String,
    pub grade: i64,
    pub section_number: i64,
    pub subsection_number: i64,
    pub objective_number: i64,
    pub description: String,
}

/// Тема Долгосрочного плана в JSON-экспорте.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct TopicJson {
    pub name: String,
    pub objective_codes: Vec<String>,
}

/// Раздел Долгосрочного плана в JSON-экспорте.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SectionJson {
    pub name: String,
    pub topics: Vec<TopicJson>,
}

/// Четверть Долгосрочного плана в JSON-экспорте.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct QuarterJson {
    pub grade: i64,
    pub quarter_number: i64,
    pub sections: Vec<SectionJson>,
}

/// Один документ в JSON-экспорте.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct DocumentJson {
    pub order_number: String,
    pub order_date: String,
    pub appendix_number: i64,
    pub subject_id: String,
    pub language: String,
    pub target_grades: String,
    pub direction: String,
    pub legal_basis: Option<String>,
    pub goal_text: Option<String>,
    pub tasks: Option<Vec<String>>,
    pub hours: Option<Vec<HoursJson>>,
    pub objectives: Vec<ObjectiveJson>,
    pub quarters: Option<Vec<QuarterJson>>,
}

/// Учебная нагрузка в JSON-экспорте.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct HoursJson {
    pub grade: i64,
    pub hours_per_week: f64,
    pub hours_per_year: i64,
}

/// Корневой объект JSON-экспорта.
#[derive(Debug, serde::Deserialize)]
pub struct ExportFileJson {
    pub documents: Vec<DocumentJson>,
}

/// Результат импорта одного документа.
#[derive(Debug, Clone)]
pub struct ImportReport {
    pub document_id: String,
    pub subject_id: String,
    pub target_grades: String,
    pub direction: TupDirection,
    pub objectives_imported: usize,
}

fn parse_direction(s: &str) -> TupDirection {
    match s {
        "emn" => TupDirection::Emn,
        "ogn" => TupDirection::Ogn,
        _ => TupDirection::Common,
    }
}

/// Импортирует документы ТУП из текста JSON в базу.
/// Возвращает (отчёт об импортированных, число пропущенных).
pub async fn import_from_json(
    pool: &SqlitePool,
    json_text: &str,
) -> Result<(Vec<ImportReport>, usize), DbError> {
    let export: ExportFileJson = serde_json::from_str(json_text).map_err(|e| {
        DbError::Internal(format!("некорректный JSON ТУП: {e}"))
    })?;

    let mut imported = Vec::new();
    let mut skipped = 0usize;
    for doc in &export.documents {
        let direction = parse_direction(&doc.direction);
        if repo_tup::find_existing(
            pool,
            &doc.subject_id,
            &doc.target_grades,
            direction,
            doc.appendix_number,
            &doc.language,
        )
        .await?
        .is_some()
        {
            skipped += 1;
            continue;
        }

        let full = build_full_document(doc, direction);

        repo_tup::save_full_document(pool, &full).await?;
        imported.push(ImportReport {
            document_id: full.document.id.to_string(),
            subject_id: full.document.subject_id.clone(),
            target_grades: full.document.target_grades.clone(),
            direction,
            objectives_imported: full.objectives.len(),
        });
    }

    Ok((imported, skipped))
}

/// Пакетный переимпорт: очищает все ТУП-таблицы и заливает заново оба файла
/// (русская и казахская версии). Используется при обновлении нормативного
/// базиса, когда старые данные нужно заменить целиком.
pub async fn reimport_from_json(
    pool: &SqlitePool,
    json_texts: &[&str],
) -> Result<(Vec<ImportReport>, usize), DbError> {
    repo_tup::delete_all_documents(pool).await?;

    let mut imported = Vec::new();
    let skipped = 0usize;
    for json_text in json_texts {
        let export: ExportFileJson = serde_json::from_str(json_text).map_err(|e| {
            DbError::Internal(format!("некорректный JSON ТУП: {e}"))
        })?;

        for doc in &export.documents {
            let direction = parse_direction(&doc.direction);
            let full = build_full_document(doc, direction);
            repo_tup::save_full_document(pool, &full).await?;
            imported.push(ImportReport {
                document_id: full.document.id.to_string(),
                subject_id: full.document.subject_id.clone(),
                target_grades: full.document.target_grades.clone(),
                direction,
                objectives_imported: full.objectives.len(),
            });
        }
    }

    Ok((imported, skipped))
}

/// Строит полный документ из JSON: документ + задачи + нагрузка + цели + ДСП.
fn build_full_document(doc: &DocumentJson, direction: TupDirection) -> FullTupDocument {
    let document = TupDocument::new(
        doc.order_number.clone(),
        doc.order_date.clone(),
        doc.appendix_number,
        doc.subject_id.clone(),
        doc.language.clone(),
        doc.target_grades.clone(),
        direction,
    );

    let mut domain_doc = document;
    domain_doc.legal_basis = doc.legal_basis.clone().unwrap_or_default();
    domain_doc.goal_text = doc.goal_text.clone().unwrap_or_default();

    let tasks: Vec<TupTask> = doc
        .tasks
        .clone()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(i, t)| TupTask::new(domain_doc.id, i as i64, t))
        .collect();

    let hours: Vec<TupSubjectHours> = doc
        .hours
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|h| TupSubjectHours::new(domain_doc.id, h.grade, h.hours_per_week, h.hours_per_year))
        .collect();

    let objectives: Vec<LearningObjective> = doc
        .objectives
        .iter()
        .map(|o| {
            LearningObjective::new(
                domain_doc.id,
                o.grade,
                o.section_number,
                o.subsection_number,
                o.objective_number,
                o.description.clone(),
                o.code.clone(),
            )
        })
        .collect();

    let quarters: Vec<TupQuarter> = doc
        .quarters
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|q| {
            let quarter_id = TupQuarterId::from(Uuid::new_v4());
            let sections: Vec<TupSection> = q
                .sections
                .into_iter()
                .enumerate()
                .map(|(si, s)| {
                    let section_id = TupSectionId::from(Uuid::new_v4());
                    let topics: Vec<TupTopic> = s
                        .topics
                        .into_iter()
                        .enumerate()
                        .map(|(ti, t)| {
                            TupTopic::new(section_id, t.name, ti as i64, t.objective_codes)
                        })
                        .collect();
                    TupSection::new(quarter_id, s.name, si as i64).with_topics(topics)
                })
                .collect();
            TupQuarter::new(domain_doc.id, q.grade, q.quarter_number).with_sections(sections)
        })
        .collect();

    FullTupDocument {
        document: domain_doc,
        tasks,
        hours,
        objectives,
        quarters,
    }
}
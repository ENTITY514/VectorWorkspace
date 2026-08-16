//! Команды нормативного базиса (ТУП): список документов, цели, импорт из файла.

use serde::Serialize;
use std::path::PathBuf;
use uuid::Uuid;

use crate::commands::AppState;
use crate::db;
use crate::db::repo_tup::TupDocumentRow;
use crate::domain::tup::{FullTupDocument, LearningObjective};
use crate::domain::ids::TupDocumentId;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupDocumentDto {
    pub id: String,
    pub order_number: String,
    pub order_date: String,
    pub appendix_number: i64,
    pub subject_id: String,
    pub language: String,
    pub target_grades: String,
    pub direction: String,
    pub objective_count: i64,
}

impl From<TupDocumentRow> for TupDocumentDto {
    fn from(r: TupDocumentRow) -> Self {
        Self {
            id: r.id,
            order_number: r.order_number,
            order_date: r.order_date,
            appendix_number: r.appendix_number,
            subject_id: r.subject_id,
            language: r.language,
            target_grades: r.target_grades,
            direction: r.direction,
            objective_count: r.objective_count,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningObjectiveDto {
    pub id: String,
    pub document_id: String,
    pub grade: i64,
    pub section_number: i64,
    pub subsection_number: i64,
    pub objective_number: i64,
    pub description: String,
    pub code: String,
}

impl From<&LearningObjective> for LearningObjectiveDto {
    fn from(o: &LearningObjective) -> Self {
        Self {
            id: o.id.to_string(),
            document_id: o.document_id.to_string(),
            grade: o.grade,
            section_number: o.section_number,
            subsection_number: o.subsection_number,
            objective_number: o.objective_number,
            description: o.description.clone(),
            code: o.code.clone(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupImportResult {
    pub document_id: String,
    pub subject_id: String,
    pub target_grades: String,
    pub direction: String,
    pub objectives_imported: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupDocumentDetailDto {
    pub id: String,
    pub order_number: String,
    pub order_date: String,
    pub appendix_number: i64,
    pub subject_id: String,
    pub language: String,
    pub target_grades: String,
    pub direction: String,
    pub legal_basis: String,
    pub goal_text: String,
    pub tasks: Vec<String>,
    pub hours: Vec<TupHourDto>,
    pub objectives: Vec<LearningObjectiveDto>,
    pub quarters: Vec<TupQuarterDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupHourDto {
    pub grade: i64,
    pub hours_per_week: f64,
    pub hours_per_year: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupQuarterDto {
    pub grade: i64,
    pub quarter_number: i64,
    pub sections: Vec<TupSectionDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupSectionDto {
    pub name: String,
    pub topics: Vec<TupTopicDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TupTopicDto {
    pub name: String,
    pub objective_codes: Vec<String>,
}

fn direction_str(d: crate::domain::tup::TupDirection) -> &'static str {
    match d {
        crate::domain::tup::TupDirection::Common => "common",
        crate::domain::tup::TupDirection::Emn => "emn",
        crate::domain::tup::TupDirection::Ogn => "ogn",
    }
}

fn document_detail_from_full(full: &FullTupDocument) -> TupDocumentDetailDto {
    TupDocumentDetailDto {
        id: full.document.id.to_string(),
        order_number: full.document.order_number.clone(),
        order_date: full.document.order_date.clone(),
        appendix_number: full.document.appendix_number,
        subject_id: full.document.subject_id.clone(),
        language: full.document.language.clone(),
        target_grades: full.document.target_grades.clone(),
        direction: direction_str(full.document.direction).to_string(),
        legal_basis: full.document.legal_basis.clone(),
        goal_text: full.document.goal_text.clone(),
        tasks: full.tasks.iter().map(|t| t.task_text.clone()).collect(),
        hours: full
            .hours
            .iter()
            .map(|h| TupHourDto {
                grade: h.grade,
                hours_per_week: h.hours_per_week,
                hours_per_year: h.hours_per_year,
            })
            .collect(),
        objectives: full.objectives.iter().map(LearningObjectiveDto::from).collect(),
        quarters: full
            .quarters
            .iter()
            .map(|q| TupQuarterDto {
                grade: q.grade,
                quarter_number: q.quarter_number,
                sections: q
                    .sections
                    .iter()
                    .map(|s| TupSectionDto {
                        name: s.name.clone(),
                        topics: s
                            .topics
                            .iter()
                            .map(|t| TupTopicDto {
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

/// Список всех документов ТУП.
#[tauri::command]
pub async fn list_tup_documents(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TupDocumentDto>, String> {
    let rows = db::repo_tup::list_documents(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(TupDocumentDto::from).collect())
}

/// Цели обучения документа (все классы или один).
#[tauri::command]
pub async fn list_objectives(
    state: tauri::State<'_, AppState>,
    document_id: String,
    grade: Option<i64>,
) -> Result<Vec<LearningObjectiveDto>, String> {
    let doc_id = TupDocumentId::from(Uuid::parse_str(&document_id).map_err(|e| e.to_string())?);
    let objectives = db::repo_tup::list_objectives(&state.pool, doc_id, grade)
        .await
        .map_err(|e| e.to_string())?;
    Ok(objectives.into_iter().map(|o| LearningObjectiveDto::from(&o)).collect())
}

/// Полный документ ТУП: цель/задачи, нагрузка, цели, Долгосрочный план.
#[tauri::command]
pub async fn get_tup_document(
    state: tauri::State<'_, AppState>,
    document_id: String,
) -> Result<TupDocumentDetailDto, String> {
    let doc_id = TupDocumentId::from(Uuid::parse_str(&document_id).map_err(|e| e.to_string())?);
    let full = db::repo_tup::get_full_document(&state.pool, doc_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Документ ТУП не найден: {document_id}"))?;
    Ok(document_detail_from_full(&full))
}

/// Импорт ТУП из текстового файла (извлечённый слой PDF).
/// Файл разбирается парсером, документы сохраняются транзакционно.
#[tauri::command]
pub async fn import_tup(
    state: tauri::State<'_, AppState>,
    path: PathBuf,
) -> Result<Vec<TupImportResult>, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed = crate::infra::tup_parser::parse_full(&text).map_err(|e| e.to_string())?;

    let mut imported = Vec::new();
    for doc in &parsed {
        // Дедупликация: уже импортированный документ не затираем.
        if db::repo_tup::find_existing(
            &state.pool,
            &doc.subject_id,
            &doc.target_grades,
            doc.direction,
            doc.appendix_number,
        )
        .await
        .map_err(|e| e.to_string())?
        .is_some()
        {
            continue;
        }

        let domain_doc = crate::infra::tup_parser::to_domain(doc);
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

        db::repo_tup::save_document(&state.pool, &domain_doc, &objectives)
            .await
            .map_err(|e| e.to_string())?;

        imported.push(TupImportResult {
            document_id: domain_doc.id.to_string(),
            subject_id: domain_doc.subject_id.clone(),
            target_grades: domain_doc.target_grades.clone(),
            direction: match domain_doc.direction {
                crate::domain::tup::TupDirection::Common => "common",
                crate::domain::tup::TupDirection::Emn => "emn",
                crate::domain::tup::TupDirection::Ogn => "ogn",
            }
            .to_string(),
            objectives_imported: objectives.len() as i64,
        });
    }

    Ok(imported)
}

/// Импорт ТУП из JSON-файла (экспорт `export_tup_html`, `tup_all_subjects_html.json`).
/// Совместно используется бинарём `import_tup_html` и UI.
#[tauri::command]
pub async fn import_tup_json(
    state: tauri::State<'_, AppState>,
    path: PathBuf,
) -> Result<Vec<TupImportResult>, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let (imported, _skipped) = crate::infra::tup_import::import_from_json(&state.pool, &text)
        .await
        .map_err(|e| e.to_string())?;

    Ok(imported
        .into_iter()
        .map(|r| TupImportResult {
            document_id: r.document_id,
            subject_id: r.subject_id,
            target_grades: r.target_grades,
            direction: match r.direction {
                crate::domain::tup::TupDirection::Common => "common",
                crate::domain::tup::TupDirection::Emn => "emn",
                crate::domain::tup::TupDirection::Ogn => "ogn",
            }
            .to_string(),
            objectives_imported: r.objectives_imported as i64,
        })
        .collect())
}

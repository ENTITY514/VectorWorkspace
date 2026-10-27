//! Команды КСП: список, создание из урока КТП, сохранение, валидация, MCP-инструменты.

use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::commands::AppState;
use crate::db;
use crate::domain::ids::KspId;
use crate::domain::invariants::LessonKind;
use crate::domain::ksp::{
    apply_locked_header, draft_from_template, rebalance_time, validate_content, KspContent,
    KspDocument, KspHeader, KspStatus, LearningObjectiveRef, LessonGoals, ValuesComponent,
    DEFAULT_LESSON_MINUTES,
};
use crate::infra::mcp;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KspBundle {
    pub document: KspDocument,
    pub report: crate::domain::ksp::ValidationReport,
}

fn kind_of(s: &str) -> LessonKind {
    match s.trim().to_ascii_lowercase().as_str() {
        "sor" => LessonKind::Sor,
        "soch" => LessonKind::Soch,
        "revision" => LessonKind::Revision,
        _ => LessonKind::Standard,
    }
}

fn header_from_offer(offer: &db::repo_ksp::LessonOfferRow, teacher_name: &str, class_name: &str) -> KspHeader {
    let objectives: Vec<LearningObjectiveRef> =
        serde_json::from_str::<Vec<serde_json::Value>>(&offer.objectives_json)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|v| {
                let code = v.get("code")?.as_str()?.to_string();
                let text = v
                    .get("description")
                    .or_else(|| v.get("text"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                Some(LearningObjectiveRef { code, text })
            })
            .collect();
    let lesson_goal = objectives
        .first()
        .map(|o| format!("Ученик может {}", o.text.trim_end_matches(';')))
        .unwrap_or_default();
    KspHeader {
        section: offer.section_name.clone(),
        topic: offer.topic_title.clone(),
        learning_objectives: objectives,
        planned_date: offer.planned_date.clone(),
        class_name: class_name.to_string(),
        teacher_name: teacher_name.to_string(),
        lesson_goals: LessonGoals { all: lesson_goal, most: String::new(), some: String::new() },
        values_component: ValuesComponent::default(),
        success_criteria: Vec::new(),
        // Адаптированная цель замкнута на КТП — как тема и цели обучения.
        adapted_goal: offer.adapted_objective.clone(),
    }
}

fn now_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn bundle(doc: KspDocument, cancelled: bool) -> KspBundle {
    let report = validate_content(&doc.content, cancelled);
    KspBundle { document: doc, report }
}

fn lock_header_from_ktp(
    content: &mut KspContent,
    offer: &db::repo_ksp::LessonOfferRow,
    class_name: &str,
) -> bool {
    let locked = header_from_offer(offer, &content.header.teacher_name, class_name);
    apply_locked_header(&mut content.header, &locked)
}

#[tauri::command]
pub async fn list_ksp_documents(state: tauri::State<'_, AppState>) -> Result<Vec<db::repo_ksp::KspCardRow>, String> {
    db::repo_ksp::list_documents(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_ksp_lesson_offers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::repo_ksp::LessonOfferRow>, String> {
    db::repo_ksp::list_lesson_offers(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_value_components(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::repo_ksp::ValueRow>, String> {
    db::repo_ksp::list_values(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_ksp_document(
    state: tauri::State<'_, AppState>,
    ksp_id: String,
) -> Result<KspBundle, String> {
    let id = KspId::from(Uuid::parse_str(&ksp_id).map_err(|e| e.to_string())?);
    let mut doc = db::repo_ksp::get_document(&state.pool, id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("КСП не найден: {ksp_id}"))?;
    let offer = db::repo_ksp::load_lesson_header(&state.pool, &doc.ktp_lesson_id)
        .await
        .map_err(|e| e.to_string())?;
    let cancelled = offer.as_ref().map(|o| o.is_cancelled != 0).unwrap_or(false);
    if let Some(o) = &offer {
        if lock_header_from_ktp(&mut doc.content, o, &doc.class_name) {
            doc.updated_at = now_stamp();
            db::repo_ksp::save_document(&state.pool, &doc, "system", Some("sync_ktp"))
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(bundle(doc, cancelled))
}

#[tauri::command]
pub async fn create_ksp_from_lesson(
    state: tauri::State<'_, AppState>,
    lesson_id: String,
    class_name: Option<String>,
    lesson_duration: Option<i64>,
) -> Result<KspBundle, String> {
    if let Some(existing) = db::repo_ksp::get_by_lesson(&state.pool, &lesson_id)
        .await
        .map_err(|e| e.to_string())?
    {
        return get_ksp_document(state, existing.id.to_string()).await;
    }
    let offer = db::repo_ksp::load_lesson_header(&state.pool, &lesson_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Урок КТП не найден: {lesson_id}"))?;
    if offer.is_cancelled != 0 {
        return Err("Нельзя создать КСП для отменённого урока КТП.".into());
    }
    let (teacher_id, teacher_name) = db::repo_ksp::default_teacher(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let class = class_name.unwrap_or_else(|| offer.grade.to_string());
    let duration = lesson_duration.unwrap_or(DEFAULT_LESSON_MINUTES).max(1);
    let header = header_from_offer(&offer, &teacher_name, &class);
    let content = draft_from_template(kind_of(&offer.lesson_type), header, duration);
    let now = now_stamp();
    let doc = KspDocument {
        id: KspId::new(),
        ktp_lesson_id: lesson_id,
        ktp_plan_id: offer.plan_id,
        teacher_id,
        class_name: class,
        status: KspStatus::Draft,
        language: if offer.language.eq_ignore_ascii_case("KK") { "kk".into() } else { "ru".into() },
        schema_version: 1,
        is_approved: false,
        content,
        created_at: now.clone(),
        updated_at: now,
    };
    db::repo_ksp::save_document(&state.pool, &doc, "user", Some("create"))
        .await
        .map_err(|e| e.to_string())?;
    Ok(bundle(doc, false))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKspIn {
    pub id: String,
    pub ktp_lesson_id: String,
    pub teacher_id: String,
    pub class_name: String,
    pub status: String,
    pub language: String,
    pub content: KspContent,
}

#[tauri::command]
pub async fn save_ksp_document(
    state: tauri::State<'_, AppState>,
    document: SaveKspIn,
) -> Result<KspBundle, String> {
    let id = KspId::from(Uuid::parse_str(&document.id).map_err(|e| e.to_string())?);
    let existing = db::repo_ksp::get_document(&state.pool, id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("КСП не найден: {}", document.id))?;
    if !document.ktp_lesson_id.is_empty() && document.ktp_lesson_id != existing.ktp_lesson_id {
        return Err("Нельзя перепривязать КСП к другому уроку КТП.".into());
    }
    let offer = db::repo_ksp::load_lesson_header(&state.pool, &existing.ktp_lesson_id)
        .await
        .map_err(|e| e.to_string())?;
    let cancelled = offer.as_ref().map(|o| o.is_cancelled != 0).unwrap_or(false);

    let mut content = document.content;
    // Тема и цели — только из КТП (FR-3.1).
    if let Some(o) = &offer {
        lock_header_from_ktp(&mut content, o, &document.class_name);
    }
    content.reindex();
    let report = validate_content(&content, cancelled);
    let mut status = KspStatus::parse(&document.status);
    if status != KspStatus::Draft && !report.can_mark_ready {
        status = KspStatus::Draft;
    }
    let now = now_stamp();
    let doc = KspDocument {
        id,
        ktp_lesson_id: existing.ktp_lesson_id,
        ktp_plan_id: existing.ktp_plan_id,
        teacher_id: document.teacher_id,
        class_name: document.class_name,
        status,
        language: document.language,
        schema_version: 1,
        is_approved: status == KspStatus::Approved,
        content,
        created_at: existing.created_at,
        updated_at: now,
    };
    db::repo_ksp::save_document(&state.pool, &doc, "user", Some("save"))
        .await
        .map_err(|e| e.to_string())?;
    Ok(KspBundle { document: doc, report })
}

#[tauri::command]
pub async fn delete_ksp_document(state: tauri::State<'_, AppState>, ksp_id: String) -> Result<(), String> {
    let id = KspId::from(Uuid::parse_str(&ksp_id).map_err(|e| e.to_string())?);
    db::repo_ksp::delete_document(&state.pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_ksp_document(
    state: tauri::State<'_, AppState>,
    ksp_id: String,
) -> Result<crate::domain::ksp::ValidationReport, String> {
    get_ksp_document(state, ksp_id).await.map(|b| b.report)
}

#[tauri::command]
pub async fn rebalance_ksp_time(
    state: tauri::State<'_, AppState>,
    ksp_id: String,
) -> Result<KspBundle, String> {
    let mut bundle = get_ksp_document(state.clone(), ksp_id).await?;
    rebalance_time(&mut bundle.document.content);
    save_ksp_document(
        state,
        SaveKspIn {
            id: bundle.document.id.to_string(),
            ktp_lesson_id: bundle.document.ktp_lesson_id,
            teacher_id: bundle.document.teacher_id,
            class_name: bundle.document.class_name,
            status: bundle.document.status.as_str().into(),
            language: bundle.document.language,
            content: bundle.document.content,
        },
    )
    .await
}

#[tauri::command]
pub async fn export_ksp_pdf(
    state: tauri::State<'_, AppState>,
    ksp_id: String,
    path: String,
) -> Result<String, String> {
    let bundle = get_ksp_document(state, ksp_id).await?;
    let bytes = crate::infra::ksp_pdf::build(&bundle.document)?;
    std::fs::write(&path, bytes).map_err(|e| format!("не удалось записать PDF: {e}"))?;
    Ok(path)
}

#[tauri::command]
pub async fn export_ksp_docx(
    state: tauri::State<'_, AppState>,
    ksp_id: String,
    path: String,
) -> Result<String, String> {
    // Карантин важнее БД: сначала фиксируй, потом экспортируй.
    if crate::infra::ksp_mcp::peek_staged_document(&ksp_id)?.is_some() {
        return Err("Сначала зафиксируйте изменения КСП.".into());
    }
    let bundle = get_ksp_document(state.clone(), ksp_id).await?;
    let doc = &bundle.document;
    if crate::infra::ksp_mcp::peek_staged_by_lesson(&doc.ktp_lesson_id)?.is_some() {
        return Err("Сначала зафиксируйте изменения КСП.".into());
    }
    let value_title = crate::infra::ksp_docx::value_title_for(
        &state.pool,
        &doc.content.header.values_component.value_ids,
    )
    .await;
    let exp = crate::infra::ksp_docx::render_ksp_docx(doc, value_title.as_deref())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("не удалось создать каталог: {e}"))?;
        }
    }
    std::fs::write(&path, &exp.bytes).map_err(|e| format!("не удалось записать docx: {e}"))?;
    Ok(path)
}

#[tauri::command]
pub async fn ksp_mcp_list_tools() -> Result<Vec<mcp::ToolInfo>, String> {
    Ok(mcp::list_tools())
}

#[tauri::command]
pub async fn ksp_mcp_invoke(
    state: tauri::State<'_, AppState>,
    tool: String,
    params: Value,
) -> Result<Value, String> {
    mcp::invoke(&state, &tool, params).await
}

#[tauri::command]
pub async fn mcp_list_tools() -> Result<Vec<mcp::ToolInfo>, String> {
    Ok(mcp::list_tools())
}

#[tauri::command]
pub async fn mcp_invoke(
    state: tauri::State<'_, AppState>,
    tool: String,
    params: Value,
) -> Result<Value, String> {
    mcp::invoke(&state, &tool, params).await
}


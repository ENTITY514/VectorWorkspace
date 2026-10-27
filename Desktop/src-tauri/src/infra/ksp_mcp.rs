//! MCP-инструменты КСП внутри ядра Tauri (ADR: сервер не выносится в отдельный процесс).
//! Чтение идёт сразу в БД. Мутации, кроме create_draft, кладутся в RAM-карантин
//! и пишутся только через `ksp_commit_staged`.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use serde_json::{json, Value};

use crate::commands::AppState;
use crate::db;
use crate::domain::adal_azamat::value_code_for_date;
use crate::domain::ids::KspId;
use crate::domain::invariants::LessonKind;
use crate::domain::ksp::{
    apply_locked_header, draft_from_template, rebalance_time, validate_content, AssessmentMode,
    Descriptor, KspDocument, KspHeader, KspStatus, LearningObjectiveRef, LessonGoals, ResourceRef,
    ValuesComponent, DEFAULT_LESSON_MINUTES, StageType,
};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub mutating: bool,
}

pub fn list_tools() -> Vec<ToolInfo> {
    [
        ("ksp_get", "Полный документ КСП", false),
        ("ksp_get_summary", "Сжатое саммари плана (is_plan_only, пока нет факта проведения)", false),
        ("ksp_list", "Список сохранённых КСП", false),
        ("ksp_validate", "Правила V-01…V-20", false),
        ("ksp_check_readiness", "Чек-лист готовности к уроку", false),
        ("ksp_create_draft", "Создать черновик из урока КТП; teacherName, иначе VECTOR_TEACHER_NAME, иначе учитель по умолчанию", true),
        ("ksp_update_stage", "Правка этапа (действия, минуты, differentiation, resources) → карантин", true),
        ("ksp_add_stage", "Добавить этап → карантин", true),
        ("ksp_remove_stage", "Удалить этап → карантин", true),
        ("ksp_reorder_stages", "Порядок этапов → карантин", true),
        ("ksp_set_assessment", "Оценивание этапа: дескрипторы, баллы, режим → карантин", true),
        ("ksp_set_homework", "Домашнее задание → карантин", true),
        ("ksp_update_header", "Цели урока и ценности; тему/цели ТУП и adaptedGoal отклоняет", true),
        ("ksp_rebalance_time", "Пересчитать минуты до эталона → карантин", true),
        ("ksp_commit_staged", "Единственная запись карантина в БД", true),
        ("ksp_discard_staged", "Отменить карантин", true),
        ("ksp_export_docx", "Экспорт КСП в docx по форме № 130 (не мутирует БД)", false),
    ]
    .into_iter()
    .map(|(name, description, mutating)| ToolInfo {
        name: name.into(),
        description: description.into(),
        mutating,
    })
    .collect()
}

fn staging() -> &'static Mutex<HashMap<String, Value>> {
    static STAGING: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new();
    STAGING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn ksp_id_of(payload: &Value) -> Option<String> {
    payload
        .get("document")
        .and_then(|d| d.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn peek_staged_doc(ksp_id: &str) -> Result<Option<(String, KspDocument)>, String> {
    let map = staging().lock().map_err(|e| format!("Карантин КСП недоступен: {e}"))?;
    let Some((key, payload)) = map.iter().find(|(_, v)| ksp_id_of(v).as_deref() == Some(ksp_id)) else {
        return Ok(None);
    };
    let doc = serde_json::from_value(
        payload.get("document").cloned().ok_or_else(|| "Нет document в карантине".to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(Some((key.clone(), doc)))
}

pub fn peek_staged_document(ksp_id: &str) -> Result<Option<(String, KspDocument)>, String> {
    peek_staged_doc(ksp_id)
}

pub fn peek_staged_by_lesson(lesson_id: &str) -> Result<Option<(String, KspDocument)>, String> {
    let map = staging().lock().map_err(|e| format!("Карантин КСП недоступен: {e}"))?;
    for (key, payload) in map.iter() {
        let Some(raw) = payload.get("document").cloned() else { continue };
        let Ok(doc) = serde_json::from_value::<KspDocument>(raw) else { continue };
        if doc.ktp_lesson_id == lesson_id {
            return Ok(Some((key.clone(), doc)));
        }
    }
    Ok(None)
}

fn put_staged(doc: &KspDocument, staged_id: Option<String>, cancelled: bool) -> Result<Value, String> {
    let staged_id = staged_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut status = doc.status;
    let report = validate_content(&doc.content, cancelled);
    if !report.can_mark_ready && status != KspStatus::Draft {
        status = KspStatus::Draft;
    }
    let mut doc = doc.clone();
    doc.status = status;
    let payload = json!({
        "stagedId": staged_id,
        "document": doc,
        "report": report,
        "isStaged": true,
    });
    let mut map = staging().lock().map_err(|e| e.to_string())?;
    map.retain(|_, v| ksp_id_of(v).as_deref() != Some(&doc.id.to_string()));
    map.insert(staged_id.clone(), payload.clone());
    Ok(payload)
}

fn objectives_from_json(raw: &str) -> Vec<LearningObjectiveRef> {
    serde_json::from_str::<Vec<Value>>(raw)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            Some(LearningObjectiveRef {
                code: v.get("code")?.as_str()?.into(),
                text: v
                    .get("description")
                    .or_else(|| v.get("text"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .into(),
            })
        })
        .collect()
}

async fn lesson_cancelled(state: &AppState, lesson_id: &str) -> bool {
    db::repo_ksp::load_lesson_header(&state.pool, lesson_id)
        .await
        .ok()
        .flatten()
        .map(|o| o.is_cancelled != 0)
        .unwrap_or(false)
}

fn require_str(params: &Value, key: &str) -> Result<String, String> {
    crate::infra::mcp::arg_str(params, &[key])
}

fn kind_of(s: &str) -> LessonKind {
    match s.trim().to_ascii_lowercase().as_str() {
        "sor" => LessonKind::Sor,
        "soch" => LessonKind::Soch,
        "revision" => LessonKind::Revision,
        _ => LessonKind::Standard,
    }
}

fn locked_header_from_offer(offer: &db::repo_ksp::LessonOfferRow, current: &KspHeader) -> KspHeader {
    KspHeader {
        section: offer.section_name.clone(),
        topic: offer.topic_title.clone(),
        learning_objectives: objectives_from_json(&offer.objectives_json),
        planned_date: offer.planned_date.clone(),
        class_name: current.class_name.clone(),
        teacher_name: current.teacher_name.clone(),
        lesson_goals: current.lesson_goals.clone(),
        values_component: current.values_component.clone(),
        success_criteria: current.success_criteria.clone(),
        adapted_goal: offer.adapted_objective.clone(),
    }
}

async fn apply_ktp_lock(state: &AppState, doc: &mut KspDocument) -> Result<(), String> {
    let Some(offer) = db::repo_ksp::load_lesson_header(&state.pool, &doc.ktp_lesson_id)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    let locked = locked_header_from_offer(&offer, &doc.content.header);
    apply_locked_header(&mut doc.content.header, &locked);
    Ok(())
}

async fn load_doc(state: &AppState, ksp_id: &str) -> Result<KspDocument, String> {
    let id = KspId::from(Uuid::parse_str(ksp_id).map_err(|e| e.to_string())?);
    db::repo_ksp::get_document(&state.pool, id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("КСП не найден: {ksp_id}"))
}

async fn resolve_ksp_id(state: &AppState, params: &Value) -> Result<String, String> {
    if let Ok(k) = crate::infra::mcp::arg_str(params, &["kspId"]) {
        return Ok(k);
    }
    let lesson = crate::infra::mcp::arg_str(params, &["ktpLessonId", "lessonId"])?;
    if let Some((_, doc)) = peek_staged_by_lesson(&lesson)? {
        return Ok(doc.id.to_string());
    }
    Ok(db::repo_ksp::get_by_lesson(&state.pool, &lesson)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "КСП для урока нет".to_string())?
        .id
        .to_string())
}

async fn load_for_read(state: &AppState, params: &Value) -> Result<(KspDocument, bool), String> {
    let id = resolve_ksp_id(state, params).await?;
    let (mut doc, staged) = if let Some((_, doc)) = peek_staged_doc(&id)? {
        (doc, true)
    } else {
        (load_doc(state, &id).await?, false)
    };
    apply_ktp_lock(state, &mut doc).await?;
    Ok((doc, staged))
}

fn with_staged_flag(doc: &KspDocument, staged: bool) -> Result<Value, String> {
    let mut v = serde_json::to_value(doc).map_err(|e| e.to_string())?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert("isStaged".into(), json!(staged));
    }
    Ok(v)
}

pub async fn invoke(state: &AppState, tool: &str, params: Value) -> Result<Value, String> {
    match tool {
        "ksp_list" => {
            let rows = db::repo_ksp::list_documents(&state.pool).await.map_err(|e| e.to_string())?;
            Ok(json!(rows))
        }
        "ksp_get" => {
            let (doc, staged) = load_for_read(state, &params).await?;
            with_staged_flag(&doc, staged)
        }
        "ksp_get_summary" => {
            let (doc, staged) = load_for_read(state, &params).await?;
            let stages: Vec<Value> = doc
                .content
                .stages
                .iter()
                .map(|s| {
                    json!({
                        "type": s.stage_type,
                        "minutes": s.duration_minutes,
                        "teacher": s.teacher_actions.chars().take(240).collect::<String>(),
                    })
                })
                .collect();
            Ok(json!({
                "isPlanOnly": true,
                "isStaged": staged,
                "kspId": doc.id.to_string(),
                "topic": doc.content.header.topic,
                "date": doc.content.header.planned_date,
                "homework": doc.content.homework.text,
                "checkMethod": doc.content.homework.check_method,
                "stages": stages,
            }))
        }
        "ksp_validate" => {
            let (doc, staged) = load_for_read(state, &params).await?;
            let cancelled = lesson_cancelled(state, &doc.ktp_lesson_id).await;
            let mut report = serde_json::to_value(validate_content(&doc.content, cancelled)).map_err(|e| e.to_string())?;
            if let Some(obj) = report.as_object_mut() {
                obj.insert("isStaged".into(), json!(staged));
                obj.insert("kspId".into(), json!(doc.id.to_string()));
            }
            Ok(report)
        }
        "ksp_check_readiness" => {
            let (doc, staged) = load_for_read(state, &params).await?;
            let cancelled = lesson_cancelled(state, &doc.ktp_lesson_id).await;
            let report = validate_content(&doc.content, cancelled);
            Ok(json!({
                "ready": report.can_mark_ready,
                "isStaged": staged,
                "kspId": doc.id.to_string(),
                "timingOk": report.total_minutes == report.lesson_duration,
                "hasValues": !doc.content.header.values_component.text.is_empty()
                    || !doc.content.header.values_component.value_ids.is_empty(),
                "hasHomework": doc.content.homework_is_satisfied(),
                "teacherActionsFilled": doc.content.stages.iter().all(|s| !s.teacher_actions.trim().is_empty()),
                "cancelledLesson": cancelled,
                "issues": report.issues,
            }))
        }
        "ksp_create_draft" => {
            let lesson_id = require_str(&params, "ktpLessonId")?;
            if let Some((_, staged)) = peek_staged_by_lesson(&lesson_id)? {
                return Ok(json!({ "alreadyExists": true, "isStaged": true, "document": staged }));
            }
            if let Some(existing) = db::repo_ksp::get_by_lesson(&state.pool, &lesson_id)
                .await
                .map_err(|e| e.to_string())?
            {
                let synced = crate::infra::mcp::sync_ksp_header_from_lesson(state, &lesson_id).await?;
                let doc = if let Some(id) = synced {
                    load_doc(state, &id).await.unwrap_or(existing)
                } else {
                    existing
                };
                return Ok(json!({ "alreadyExists": true, "isStaged": false, "document": doc }));
            }
            let offer = db::repo_ksp::load_lesson_header(&state.pool, &lesson_id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Урок КТП не найден: {lesson_id}"))?;
            if offer.is_cancelled != 0 {
                return Err("Нельзя создать КСП для отменённого урока КТП.".into());
            }
            let (teacher_id, default_teacher) = db::repo_ksp::default_teacher(&state.pool)
                .await
                .map_err(|e| e.to_string())?;
            // Имя учителя: параметр → переменная окружения → учитель по умолчанию.
            let teacher_name = crate::infra::mcp::arg_str(&params, &["teacherName"])
                .ok()
                .or_else(|| std::env::var("VECTOR_TEACHER_NAME").ok().filter(|s| !s.trim().is_empty()))
                .unwrap_or(default_teacher);
            let class = params
                .get("className")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let class = if class.is_empty() { offer.grade.to_string() } else { class };
            let duration = crate::infra::mcp::arg_i64(&params, &["lessonDuration"])
                .unwrap_or(DEFAULT_LESSON_MINUTES)
                .max(1);
            let objectives = objectives_from_json(&offer.objectives_json);
            // Ценность месяца плановой даты — в воспитательный компонент.
            let value_ids: Vec<String> = offer
                .planned_date
                .as_deref()
                .and_then(value_code_for_date)
                .map(|code| vec![code.to_string()])
                .unwrap_or_default();
            let header = KspHeader {
                section: offer.section_name.clone(),
                topic: offer.topic_title.clone(),
                learning_objectives: objectives,
                planned_date: offer.planned_date.clone(),
                class_name: class.clone(),
                teacher_name,
                lesson_goals: LessonGoals::default(),
                values_component: ValuesComponent { value_ids, text: String::new() },
                success_criteria: Vec::new(),
                adapted_goal: offer.adapted_objective.clone(),
            };
            let kind = kind_of(&offer.lesson_type);
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let doc = KspDocument {
                id: KspId::new(),
                ktp_lesson_id: lesson_id.clone(),
                ktp_plan_id: offer.plan_id,
                teacher_id,
                class_name: class,
                status: KspStatus::Draft,
                language: if offer.language.eq_ignore_ascii_case("KK") { "kk".into() } else { "ru".into() },
                schema_version: 1,
                is_approved: false,
                content: draft_from_template(kind, header, duration),
                created_at: now.clone(),
                updated_at: now,
            };
            if let Err(e) = db::repo_ksp::save_document(&state.pool, &doc, "agent", Some("mcp_create")).await {
                let msg = e.to_string();
                if msg.to_ascii_lowercase().contains("unique") {
                    let existing = db::repo_ksp::get_by_lesson(&state.pool, &lesson_id)
                        .await
                        .map_err(|e| e.to_string())?
                        .ok_or(msg)?;
                    return Ok(json!({ "alreadyExists": true, "isStaged": false, "document": existing }));
                }
                return Err(msg);
            }
            Ok(json!({ "alreadyExists": false, "isStaged": false, "document": doc }))
        }
        "ksp_update_stage" => mutate_doc(state, &params, |doc, p| {
            let sid = require_str(p, "stageId")?;
            let stage = doc
                .content
                .stages
                .iter_mut()
                .find(|s| s.id == sid)
                .ok_or_else(|| "Этап не найден".to_string())?;
            if let Some(t) = p.get("teacherActions").and_then(|v| v.as_str()) {
                stage.teacher_actions = t.into();
            }
            if let Some(t) = p.get("studentActions").and_then(|v| v.as_str()) {
                stage.student_actions = t.into();
            }
            if let Some(m) = crate::infra::mcp::arg_i64(p, &["durationMinutes"]) {
                stage.duration_minutes = m.max(1);
            }
            if let Some(t) = p.get("differentiation").and_then(|v| v.as_str()) {
                stage.differentiation = t.into();
            }
            if let Some(list) = p.get("resources").and_then(|v| v.as_array()) {
                stage.resources = list
                    .iter()
                    .filter_map(|v| {
                        Some(ResourceRef { kind: "text".into(), display: v.as_str()?.into() })
                    })
                    .collect();
            }
            Ok(())
        })
        .await,
        "ksp_add_stage" => mutate_doc(state, &params, |doc, p| {
            let ty = p.get("type").and_then(|v| v.as_str()).unwrap_or("practice");
            let stage_type = parse_stage(ty)?;
            let minutes = crate::infra::mcp::arg_i64(p, &["durationMinutes"]).unwrap_or(5);
            doc.content.stages.push(crate::domain::ksp::KspStage {
                id: Uuid::new_v4().to_string(),
                stage_type,
                order: (doc.content.stages.len() + 1) as i64,
                duration_minutes: minutes.max(1),
                teacher_actions: p.get("teacherActions").and_then(|v| v.as_str()).unwrap_or("").into(),
                student_actions: p.get("studentActions").and_then(|v| v.as_str()).unwrap_or("").into(),
                resources: Vec::new(),
                assessment: crate::domain::ksp::StageAssessment::for_type(stage_type),
                differentiation: String::new(),
            });
            Ok(())
        })
        .await,
        "ksp_remove_stage" => mutate_doc(state, &params, |doc, p| {
            let sid = require_str(p, "stageId")?;
            let before = doc.content.stages.len();
            doc.content.stages.retain(|s| s.id != sid);
            if doc.content.stages.len() == before {
                return Err("Этап не найден".into());
            }
            doc.content.reindex();
            Ok(())
        })
        .await,
        "ksp_reorder_stages" => mutate_doc(state, &params, |doc, p| {
            let order = p
                .get("order")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "Нужен order: [stageId]".to_string())?;
            let ids: Vec<String> = order.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
            let mut next = Vec::new();
            for id in &ids {
                if let Some(s) = doc.content.stages.iter().find(|x| x.id == *id) {
                    next.push(s.clone());
                }
            }
            for s in &doc.content.stages {
                if !ids.contains(&s.id) {
                    next.push(s.clone());
                }
            }
            doc.content.stages = next;
            doc.content.reindex();
            Ok(())
        })
        .await,
        "ksp_set_assessment" => mutate_doc(state, &params, |doc, p| {
            let sid = require_str(p, "stageId")?;
            let stage = doc
                .content
                .stages
                .iter_mut()
                .find(|s| s.id == sid)
                .ok_or_else(|| "Этап не найден".to_string())?;
            let descriptors = p
                .get("descriptors")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "Нужен массив descriptors: [{text, points?}]".to_string())?;
            stage.assessment.descriptors = descriptors
                .iter()
                .filter_map(|v| {
                    Some(Descriptor {
                        text: v.get("text")?.as_str()?.into(),
                        points: crate::infra::mcp::arg_i64(v, &["points"]),
                    })
                })
                .collect();
            if let Some(max) = crate::infra::mcp::arg_i64(p, &["maxPoints"]) {
                stage.assessment.max_points = Some(max);
            } else if !stage.assessment.descriptors.is_empty()
                && stage.assessment.descriptors.iter().all(|d| d.points.is_some())
            {
                // maxPoints не передан, но у всех дескрипторов есть баллы — сумма.
                stage.assessment.max_points =
                    Some(stage.assessment.descriptors.iter().filter_map(|d| d.points).sum());
            }
            if let Some(f) = p.get("feedbackMethod").and_then(|v| v.as_str()) {
                stage.assessment.feedback_method = f.into();
            }
            if let Some(m) = p.get("mode").and_then(|v| v.as_str()) {
                stage.assessment.mode = parse_mode(m)?;
            }
            Ok(())
        })
        .await,
        "ksp_set_homework" => mutate_doc(state, &params, |doc, p| {
            if let Some(t) = p.get("text").and_then(|v| v.as_str()) {
                doc.content.homework.text = t.into();
            }
            if let Some(t) = p.get("checkMethod").and_then(|v| v.as_str()) {
                doc.content.homework.check_method = t.into();
            }
            Ok(())
        })
        .await,
        "ksp_update_header" => mutate_doc(state, &params, |doc, p| {
            if p.get("topic").is_some()
                || p.get("section").is_some()
                || p.get("learningObjectives").is_some()
                || p.get("plannedDate").is_some()
                || p.get("adaptedGoal").is_some()
            {
                return Err("Тему, раздел, дату, цели обучения и адаптированную цель меняйте в КТП (ktp_update_lesson / ktp_set_lesson_objectives).".into());
            }
            if let Some(t) = p.get("valuesText").and_then(|v| v.as_str()) {
                doc.content.header.values_component.text = t.into();
            }
            if let Some(ids) = p.get("valueIds").and_then(|v| v.as_array()) {
                doc.content.header.values_component.value_ids =
                    ids.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
            }
            if let Some(all) = p.get("lessonGoalAll").and_then(|v| v.as_str()) {
                doc.content.header.lesson_goals.all = all.into();
            }
            if let Some(most) = p.get("lessonGoalMost").and_then(|v| v.as_str()) {
                doc.content.header.lesson_goals.most = most.into();
            }
            if let Some(some) = p.get("lessonGoalSome").and_then(|v| v.as_str()) {
                doc.content.header.lesson_goals.some = some.into();
            }
            Ok(())
        })
        .await,
        "ksp_rebalance_time" => mutate_doc(state, &params, |doc, _| {
            rebalance_time(&mut doc.content);
            Ok(())
        })
        .await,
        "ksp_commit_staged" => {
            let staged_id = require_str(&params, "stagedId")?;
            let payload = {
                let map = staging().lock().map_err(|e| e.to_string())?;
                map.get(&staged_id)
                    .cloned()
                    .ok_or_else(|| "Карантин не найден или уже применён".to_string())?
            };
            let mut doc: KspDocument = serde_json::from_value(
                payload.get("document").cloned().ok_or_else(|| "Нет document в карантине".to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let existing = db::repo_ksp::get_document(&state.pool, doc.id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("КСП не найден: {}", doc.id))?;
            doc.ktp_lesson_id = existing.ktp_lesson_id;
            doc.ktp_plan_id = existing.ktp_plan_id;
            doc.created_at = existing.created_at;
            apply_ktp_lock(state, &mut doc).await?;
            let cancelled = lesson_cancelled(state, &doc.ktp_lesson_id).await;
            let report = validate_content(&doc.content, cancelled);
            if !report.can_mark_ready {
                doc.status = KspStatus::Draft;
            }
            db::repo_ksp::save_document(&state.pool, &doc, "agent", Some("mcp_commit"))
                .await
                .map_err(|e| e.to_string())?;
            staging().lock().map_err(|e| e.to_string())?.remove(&staged_id);
            Ok(json!({ "committed": true, "kspId": doc.id.to_string(), "status": doc.status, "report": report }))
        }
        "ksp_discard_staged" => {
            let staged_id = require_str(&params, "stagedId")?;
            staging().lock().map_err(|e| e.to_string())?.remove(&staged_id);
            Ok(json!({ "discarded": true }))
        }
        "ksp_export_docx" => export_docx(state, &params).await,
        other => Err(format!("Неизвестный инструмент: {other}")),
    }
}

/// Экспорт КСП в docx (БД не меняется): `kspId` или `ktpLessonId`, обяз. `outputDir`, опц. `fileName`.
/// `quarter_index` для имени файла — из урока КТП; при карантине — отказ.
async fn export_docx(state: &AppState, params: &Value) -> Result<Value, String> {
    let id = resolve_ksp_id(state, params).await?;
    // Карантин важнее БД: сначала фиксируй, потом экспортируй.
    if peek_staged_doc(&id)?.is_some() {
        return Err("Сначала ksp_commit_staged: есть незафиксированный карантин.".into());
    }
    let mut doc = load_doc(state, &id).await?;
    apply_ktp_lock(state, &mut doc).await?;
    if peek_staged_by_lesson(&doc.ktp_lesson_id)?.is_some() {
        return Err("Сначала ksp_commit_staged: есть незафиксированный карантин.".into());
    }
    let out_dir = crate::infra::mcp::arg_str(params, &["outputDir"])?;
    let value_title =
        crate::infra::ksp_docx::value_title_for(&state.pool, &doc.content.header.values_component.value_ids)
            .await;
    let exp = crate::infra::ksp_docx::render_ksp_docx(&doc, value_title.as_deref())?;
    let quarter =
        crate::infra::ksp_docx::quarter_index_of(&state.pool, &doc.ktp_lesson_id).await;
    let name = params
        .get("fileName")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| crate::infra::ksp_docx::ksp_file_name(&doc, quarter));
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("не удалось создать каталог: {e}"))?;
    let path = std::path::Path::new(&out_dir).join(&name);
    std::fs::write(&path, &exp.bytes).map_err(|e| format!("не удалось записать docx: {e}"))?;
    Ok(json!({ "path": path.to_string_lossy(), "warnings": exp.warnings }))
}

async fn mutate_doc(
    state: &AppState,
    params: &Value,
    f: impl FnOnce(&mut KspDocument, &Value) -> Result<(), String>,
) -> Result<Value, String> {
    let id = require_str(params, "kspId")?;
    let (staged_id, mut doc) = if let Some(pair) = peek_staged_doc(&id)? {
        pair
    } else {
        (Uuid::new_v4().to_string(), load_doc(state, &id).await?)
    };
    apply_ktp_lock(state, &mut doc).await?;
    f(&mut doc, params)?;
    doc.content.reindex();
    let cancelled = lesson_cancelled(state, &doc.ktp_lesson_id).await;
    put_staged(&doc, Some(staged_id), cancelled)
}

fn parse_stage(s: &str) -> Result<StageType, String> {
    let key = s.trim().to_ascii_lowercase().replace('-', "_");
    match key.as_str() {
        "greeting" => Ok(StageType::Greeting),
        "warmup" => Ok(StageType::Warmup),
        "actualization" => Ok(StageType::Actualization),
        "theory" => Ok(StageType::Theory),
        "practice" => Ok(StageType::Practice),
        "formative" | "formative_assessment" | "formativeassessment" => Ok(StageType::FormativeAssessment),
        "sor" => Ok(StageType::Sor),
        "soch" => Ok(StageType::Soch),
        "homework" => Ok(StageType::Homework),
        "reflection" => Ok(StageType::Reflection),
        "physical" | "physical_minute" | "physicalminute" => Ok(StageType::PhysicalMinute),
        other => Err(format!("Неизвестный тип этапа «{other}».")),
    }
}

fn parse_mode(s: &str) -> Result<AssessmentMode, String> {
    match s.trim().to_ascii_lowercase().as_str() {
        "none" => Ok(AssessmentMode::None),
        "formative" => Ok(AssessmentMode::Formative),
        "summative" => Ok(AssessmentMode::Summative),
        other => Err(format!("Неизвестный режим оценивания «{other}». Нужен none|formative|summative.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stage_rejects_unknown() {
        assert!(parse_stage("banana").is_err());
        assert_eq!(parse_stage("formative").unwrap(), StageType::FormativeAssessment);
        assert_eq!(parse_stage("practice").unwrap(), StageType::Practice);
    }

    #[test]
    fn kind_of_is_case_insensitive() {
        assert_eq!(kind_of("SOR"), LessonKind::Sor);
        assert_eq!(kind_of("soch"), LessonKind::Soch);
        assert_eq!(kind_of("Standard"), LessonKind::Standard);
    }

    #[test]
    fn parse_mode_rejects_unknown() {
        assert!(parse_mode("banana").is_err());
        assert_eq!(parse_mode("Summative").unwrap(), AssessmentMode::Summative);
        assert_eq!(parse_mode("formative").unwrap(), AssessmentMode::Formative);
        assert_eq!(parse_mode("none").unwrap(), AssessmentMode::None);
    }

    #[test]
    fn list_tools_covers_set_assessment() {
        let names: Vec<_> = list_tools().into_iter().map(|t| t.name).collect();
        assert!(names.contains(&"ksp_set_assessment".into()));
        assert!(names.contains(&"ksp_export_docx".into()));
        assert!(list_tools().iter().all(|t| !t.description.contains("V-01…V-18")));
    }
}

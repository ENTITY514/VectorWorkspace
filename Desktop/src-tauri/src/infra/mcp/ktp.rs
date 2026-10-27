//! Чтение и правка КТП. Урок правится на месте — FK на КСП не рвётся.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use chrono::NaiveDate;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::commands::AppState;
use crate::db;
use crate::domain::ids::KtpPlanId;
use crate::domain::invariants::LessonKind;
use crate::domain::ktp::{KtpLesson, KtpPlan, KtpStatus, LessonObjective};
use crate::domain::ksp::{apply_locked_header, LearningObjectiveRef};
use crate::infra::ktp_service::validate_invariants;

use super::{arg_bool, arg_i64, arg_str};

fn staging() -> &'static Mutex<HashMap<String, Value>> {
    static STAGING: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new();
    STAGING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn kind_of(s: &str) -> LessonKind {
    match s.trim().to_ascii_lowercase().as_str() {
        "sor" => LessonKind::Sor,
        "soch" => LessonKind::Soch,
        "revision" => LessonKind::Revision,
        _ => LessonKind::Standard,
    }
}

fn parse_date(raw: &str) -> Result<Option<NaiveDate>, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(None);
    }
    let day = raw.split(['T', ' ']).next().unwrap_or(raw);
    NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| format!("Неверная дата «{raw}». Нужен формат YYYY-MM-DD."))
}

fn peek_staged_for_lesson(lesson_id: &str) -> Result<Option<Value>, String> {
    let map = staging().lock().map_err(|e| format!("Карантин КТП недоступен: {e}"))?;
    Ok(map
        .values()
        .find(|v| v.get("lessonId").and_then(|x| x.as_str()) == Some(lesson_id))
        .cloned())
}

fn overlay_offer(row: &mut db::repo_ksp::LessonOfferRow, lesson: &KtpLesson) {
    row.topic_title = lesson.topic_title.clone();
    row.section_name = lesson.section_name.clone();
    row.lesson_type = lesson.lesson_type.as_str().to_string();
    row.planned_date = lesson.planned_date.map(|d| d.to_string());
    row.is_cancelled = i64::from(lesson.is_cancelled);
    row.objectives_json = serde_json::to_string(&lesson.objectives).unwrap_or_else(|_| "[]".into());
    row.adapted_objective = lesson.adapted_objective.clone();
}

pub fn overlay_offer_if_staged(row: &mut db::repo_ksp::LessonOfferRow) -> Result<bool, String> {
    let Some(payload) = peek_staged_for_lesson(&row.lesson_id)? else {
        return Ok(false);
    };
    let lesson: KtpLesson = serde_json::from_value(
        payload.get("lesson").cloned().ok_or_else(|| "Нет lesson в карантине".to_string())?,
    )
    .map_err(|e| e.to_string())?;
    overlay_offer(row, &lesson);
    Ok(true)
}

fn apply_staged_to_offers(rows: &mut [db::repo_ksp::LessonOfferRow]) -> Result<(), String> {
    for row in rows.iter_mut() {
        overlay_offer_if_staged(row)?;
    }
    Ok(())
}

fn apply_all_staged_to_plan(plan: &mut KtpPlan) -> Result<Vec<String>, String> {
    let map = staging().lock().map_err(|e| format!("Карантин КТП недоступен: {e}"))?;
    let plan_id = plan.id.to_string();
    let mut ids = Vec::new();
    for v in map.values() {
        if v.get("planId").and_then(|x| x.as_str()) != Some(plan_id.as_str()) {
            continue;
        }
        let Some(raw) = v.get("lesson").cloned() else { continue };
        let Ok(lesson) = serde_json::from_value::<KtpLesson>(raw) else { continue };
        let id = lesson.id.to_string();
        if let Ok(slot) = find_lesson_mut(plan, &id) {
            *slot = lesson;
            ids.push(id);
        }
    }
    Ok(ids)
}

fn find_lesson_mut<'a>(plan: &'a mut KtpPlan, lesson_id: &str) -> Result<&'a mut KtpLesson, String> {
    plan.quarters
        .iter_mut()
        .flat_map(|q| q.lessons.iter_mut())
        .find(|l| l.id.to_string() == lesson_id)
        .ok_or_else(|| format!("Урок не найден в плане: {lesson_id}"))
}

fn find_lesson<'a>(plan: &'a KtpPlan, lesson_id: &str) -> Result<&'a KtpLesson, String> {
    plan.quarters
        .iter()
        .flat_map(|q| q.lessons.iter())
        .find(|l| l.id.to_string() == lesson_id)
        .ok_or_else(|| format!("Урок не найден в плане: {lesson_id}"))
}

async fn load_plan_by_lesson(state: &AppState, lesson_id: &str) -> Result<KtpPlan, String> {
    let offer = db::repo_ksp::load_lesson_header(&state.pool, lesson_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Урок КТП не найден: {lesson_id}"))?;
    let pid = KtpPlanId::from(Uuid::parse_str(&offer.plan_id).map_err(|e| e.to_string())?);
    db::repo_ktp::load_plan(&state.pool, pid)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("План КТП не найден: {}", offer.plan_id))
}

fn put_staged(plan: &KtpPlan, lesson_id: &str, type_changed: bool, staged_id: Option<String>) -> Result<Value, String> {
    let lesson = find_lesson(plan, lesson_id)?.clone();
    let report = validate_invariants(plan);
    let staged_id = staged_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let payload = json!({
        "stagedId": staged_id,
        "kind": "ktp_lesson",
        "planId": plan.id.to_string(),
        "lessonId": lesson_id,
        "lesson": lesson,
        "subjectId": plan.subject_id,
        "language": plan.language,
        "grade": plan.grade,
        "typeChanged": type_changed,
        "invariants": report,
        "isStaged": true,
    });
    let mut map = staging().lock().map_err(|e| e.to_string())?;
    map.retain(|_, v| v.get("lessonId").and_then(|x| x.as_str()) != Some(lesson_id));
    map.insert(staged_id.clone(), payload.clone());
    Ok(payload)
}

async fn load_plan_for_edit(
    state: &AppState,
    lesson_id: &str,
) -> Result<(KtpPlan, Option<String>, LessonKind), String> {
    let mut plan = load_plan_by_lesson(state, lesson_id).await?;
    let original_type = find_lesson(&plan, lesson_id)?.lesson_type;
    let staged_id = if let Some(payload) = peek_staged_for_lesson(lesson_id)? {
        let lesson: KtpLesson = serde_json::from_value(
            payload.get("lesson").cloned().ok_or_else(|| "Нет lesson в карантине".to_string())?,
        )
        .map_err(|e| e.to_string())?;
        *find_lesson_mut(&mut plan, lesson_id)? = lesson;
        payload.get("stagedId").and_then(|v| v.as_str()).map(|s| s.to_string())
    } else {
        None
    };
    Ok((plan, staged_id, original_type))
}

pub async fn sync_ksp_header_from_lesson(state: &AppState, lesson_id: &str) -> Result<Option<String>, String> {
    let Some(mut doc) = db::repo_ksp::get_by_lesson(&state.pool, lesson_id)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };
    let Some(offer) = db::repo_ksp::load_lesson_header(&state.pool, lesson_id)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };
    let objectives: Vec<LearningObjectiveRef> = serde_json::from_str::<Vec<Value>>(&offer.objectives_json)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            Some(LearningObjectiveRef {
                code: v.get("code")?.as_str()?.into(),
                text: v.get("description").or_else(|| v.get("text")).and_then(|x| x.as_str()).unwrap_or("").into(),
            })
        })
        .collect();
    let locked = crate::domain::ksp::KspHeader {
        section: offer.section_name,
        topic: offer.topic_title,
        learning_objectives: objectives,
        planned_date: offer.planned_date,
        class_name: doc.content.header.class_name.clone(),
        teacher_name: doc.content.header.teacher_name.clone(),
        lesson_goals: doc.content.header.lesson_goals.clone(),
        values_component: doc.content.header.values_component.clone(),
        success_criteria: doc.content.header.success_criteria.clone(),
        adapted_goal: offer.adapted_objective.clone(),
    };
    if apply_locked_header(&mut doc.content.header, &locked) {
        db::repo_ksp::save_document(&state.pool, &doc, "agent", Some("sync_after_ktp"))
            .await
            .map_err(|e| e.to_string())?;
        return Ok(Some(doc.id.to_string()));
    }
    Ok(Some(doc.id.to_string()))
}

pub async fn invoke(state: &AppState, tool: &str, params: Value) -> Result<Value, String> {
    match tool {
        "ktp_list_plans" => {
            let rows = db::repo_ktp::list_plans(&state.pool).await.map_err(|e| e.to_string())?;
            Ok(json!(rows.into_iter().map(|r| json!({
                "id": r.id,
                "subjectId": r.subject_id,
                "grade": r.grade,
                "language": r.language,
                "academicYear": r.academic_year,
                "totalHours": r.total_hours,
                "status": r.status,
                "daysOfWeek": r.days_of_week,
            })).collect::<Vec<_>>()))
        }
        "ktp_get_plan_lessons" => {
            let plan_id = arg_str(&params, &["planId"])?;
            let pid = KtpPlanId::from(Uuid::parse_str(&plan_id).map_err(|e| e.to_string())?);
            let mut plan = db::repo_ktp::load_plan(&state.pool, pid)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("План не найден: {plan_id}"))?;
            let staged_ids = apply_all_staged_to_plan(&mut plan)?;
            let offers = db::repo_ksp::list_all_lesson_offers(&state.pool).await.map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            for q in &plan.quarters {
                for l in &q.lessons {
                    let id = l.id.to_string();
                    let ksp = offers.iter().find(|o| o.lesson_id == id);
                    out.push(json!({
                        "lessonId": id,
                        "quarter": q.quarter_number,
                        "globalIndex": l.global_index,
                        "topicTitle": l.topic_title,
                        "sectionName": l.section_name,
                        "lessonType": l.lesson_type.as_str(),
                        "plannedDate": l.planned_date.map(|d| d.to_string()),
                        "isCancelled": l.is_cancelled,
                        "isStaged": staged_ids.iter().any(|s| s == &id),
                        "hasKsp": ksp.map(|o| o.has_ksp != 0).unwrap_or(false),
                        "kspId": ksp.and_then(|o| o.ksp_id.clone()),
                    }));
                }
            }
            Ok(json!({
                "planId": plan.id.to_string(),
                "subjectId": plan.subject_id,
                "grade": plan.grade,
                "academicYear": plan.academic_year,
                "status": plan.status.as_str(),
                "lessons": out,
            }))
        }
        "ktp_find_lesson" => {
            let q = params.get("topicQuery").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let grade = arg_i64(&params, &["grade"]);
            let subject = params.get("subjectId").and_then(|v| v.as_str()).unwrap_or("");
            let mut rows = db::repo_ksp::list_all_lesson_offers(&state.pool).await.map_err(|e| e.to_string())?;
            apply_staged_to_offers(&mut rows)?;
            rows.retain(|r| {
                (grade.is_none() || Some(r.grade) == grade)
                    && (subject.is_empty() || r.subject_id == subject)
                    && (q.is_empty()
                        || r.topic_title.to_lowercase().contains(&q)
                        || r.section_name.to_lowercase().contains(&q))
            });
            rows.truncate(40);
            Ok(json!(rows))
        }
        "ktp_get_lesson" => {
            let id = arg_str(&params, &["lessonId"])?;
            let mut row = db::repo_ksp::load_lesson_header(&state.pool, &id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Урок не найден: {id}"))?;
            let staged = overlay_offer_if_staged(&mut row)?;
            let mut v = serde_json::to_value(&row).map_err(|e| e.to_string())?;
            if let Some(obj) = v.as_object_mut() {
                obj.insert("isStaged".into(), json!(staged));
            }
            Ok(v)
        }
        "ktp_get_context" => {
            let id = arg_str(&params, &["lessonId"])?;
            let mut rows = db::repo_ksp::neighbor_lessons(&state.pool, &id)
                .await
                .map_err(|e| e.to_string())?;
            apply_staged_to_offers(&mut rows)?;
            Ok(json!({ "window": rows }))
        }
        "ktp_get_section_progress" => {
            let id = arg_str(&params, &["lessonId"])?;
            let mut cur = db::repo_ksp::load_lesson_header(&state.pool, &id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Урок не найден: {id}"))?;
            overlay_offer_if_staged(&mut cur)?;
            let mut rows = db::repo_ksp::list_all_lesson_offers(&state.pool).await.map_err(|e| e.to_string())?;
            apply_staged_to_offers(&mut rows)?;
            let same: Vec<_> = rows
                .into_iter()
                .filter(|r| r.plan_id == cur.plan_id && r.section_name == cur.section_name)
                .collect();
            let dated = same.iter().filter(|r| r.planned_date.is_some()).count();
            let with_ksp = same.iter().filter(|r| r.has_ksp != 0).count();
            let cancelled = same.iter().filter(|r| r.is_cancelled != 0).count();
            Ok(json!({
                "section": cur.section_name,
                "planId": cur.plan_id,
                "total": same.len(),
                "withDate": dated,
                "withKsp": with_ksp,
                "cancelled": cancelled,
            }))
        }
        "ktp_validate" => {
            let plan_id = arg_str(&params, &["planId"])?;
            let pid = KtpPlanId::from(Uuid::parse_str(&plan_id).map_err(|e| e.to_string())?);
            let mut plan = db::repo_ktp::load_plan(&state.pool, pid)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("План не найден: {plan_id}"))?;
            let staged_lessons = apply_all_staged_to_plan(&mut plan)?;
            let mut report = serde_json::to_value(validate_invariants(&plan)).map_err(|e| e.to_string())?;
            if let Some(obj) = report.as_object_mut() {
                obj.insert("stagedLessonIds".into(), json!(staged_lessons));
            }
            Ok(report)
        }
        "ktp_update_lesson" => {
            let lesson_id = arg_str(&params, &["lessonId"])?;
            let (mut plan, staged_id, original_type) = load_plan_for_edit(state, &lesson_id).await?;
            if plan.status == KtpStatus::Archived {
                return Err("Архивный КТП нельзя править.".into());
            }
            {
                let lesson = find_lesson_mut(&mut plan, &lesson_id)?;
                if let Some(t) = params.get("topicTitle").and_then(|v| v.as_str()) {
                    lesson.topic_title = t.into();
                }
                if let Some(t) = params.get("sectionName").and_then(|v| v.as_str()) {
                    lesson.section_name = t.into();
                }
                if let Some(t) = params.get("notes").and_then(|v| v.as_str()) {
                    lesson.notes = t.into();
                }
                if let Some(t) = params.get("adaptedObjective").and_then(|v| v.as_str()) {
                    lesson.adapted_objective = t.into();
                }
                if let Some(d) = params.get("plannedDate").and_then(|v| v.as_str()) {
                    lesson.planned_date = parse_date(d)?;
                }
                if let Some(c) = arg_bool(&params, &["isCancelled"]) {
                    lesson.is_cancelled = c;
                }
                if let Some(ty) = params.get("lessonType").and_then(|v| v.as_str()) {
                    lesson.lesson_type = kind_of(ty);
                }
            }
            let type_changed = find_lesson(&plan, &lesson_id)?.lesson_type != original_type;
            put_staged(&plan, &lesson_id, type_changed, staged_id)
        }
        "ktp_set_lesson_objectives" => {
            let lesson_id = arg_str(&params, &["lessonId"])?;
            let (mut plan, staged_id, original_type) = load_plan_for_edit(state, &lesson_id).await?;
            if plan.status == KtpStatus::Archived {
                return Err("Архивный КТП нельзя править.".into());
            }
            let objs = params
                .get("objectives")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "Нужен массив objectives: [{code, description}]".to_string())?;
            {
                let lesson = find_lesson_mut(&mut plan, &lesson_id)?;
                lesson.objectives = objs
                    .iter()
                    .filter_map(|v| {
                        Some(LessonObjective {
                            code: v.get("code")?.as_str()?.to_string(),
                            description: v
                                .get("description")
                                .or_else(|| v.get("text"))
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string(),
                        })
                    })
                    .collect();
            }
            let type_changed = find_lesson(&plan, &lesson_id)?.lesson_type != original_type;
            put_staged(&plan, &lesson_id, type_changed, staged_id)
        }
        "ktp_commit_staged" => {
            let staged_id = arg_str(&params, &["stagedId"])?;
            let payload = {
                let map = staging().lock().map_err(|e| e.to_string())?;
                map.get(&staged_id)
                    .cloned()
                    .ok_or_else(|| "Карантин КТП не найден или уже применён".to_string())?
            };
            let lesson: KtpLesson = serde_json::from_value(
                payload.get("lesson").cloned().ok_or_else(|| "Нет lesson в карантине".to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let plan_id = payload
                .get("planId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Нет planId в карантине".to_string())?;
            let pid = KtpPlanId::from(Uuid::parse_str(plan_id).map_err(|e| e.to_string())?);
            let mut plan = db::repo_ktp::load_plan(&state.pool, pid)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("План не найден: {plan_id}"))?;
            if plan.status == KtpStatus::Archived {
                return Err("Архивный КТП нельзя править.".into());
            }
            let lesson_id = lesson.id.to_string();
            let original_type = find_lesson(&plan, &lesson_id)?.lesson_type;
            *find_lesson_mut(&mut plan, &lesson_id)? = lesson.clone();
            if lesson.lesson_type != original_type {
                let report = validate_invariants(&plan);
                if !report.valid {
                    return Err("Инварианты СОР/СОЧ нарушены. Исправьте тип урока или вызовите ktp_discard_staged.".into());
                }
            }
            let subject_id = payload.get("subjectId").and_then(|v| v.as_str()).unwrap_or("");
            let language = payload.get("language").and_then(|v| v.as_str()).unwrap_or("RU");
            let grade = payload.get("grade").and_then(|v| v.as_i64()).unwrap_or(0);
            db::repo_ktp::update_lesson(&state.pool, &lesson, subject_id, language, grade)
                .await
                .map_err(|e| e.to_string())?;
            staging().lock().map_err(|e| e.to_string())?.remove(&staged_id);
            let ksp_id = sync_ksp_header_from_lesson(state, &lesson_id).await?;
            Ok(json!({
                "committed": true,
                "lessonId": lesson_id,
                "kspSynced": ksp_id,
            }))
        }
        "ktp_discard_staged" => {
            let staged_id = arg_str(&params, &["stagedId"])?;
            staging().lock().map_err(|e| e.to_string())?.remove(&staged_id);
            Ok(json!({ "discarded": true }))
        }
        other => Err(format!("Неизвестный инструмент КТП: {other}")),
    }
}

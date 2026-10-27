//! Связка урок КТП ↔ документ КСП. Один урок — не больше одного КСП.

use serde_json::{json, Value};

use crate::commands::AppState;
use crate::db;
use crate::domain::ksp::{apply_locked_header, date_key, KspDocument, KspHeader, LearningObjectiveRef};

use super::arg_str;
use super::ktp::overlay_offer_if_staged;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldDrift {
    pub field: &'static str,
    pub ktp: String,
    pub ksp: String,
}

pub fn header_drift(doc: &KspDocument, topic: &str, section: &str, date: &Option<String>, objectives_json: &str) -> Vec<FieldDrift> {
    let mut out = Vec::new();
    let h = &doc.content.header;
    if h.topic.trim() != topic.trim() {
        out.push(FieldDrift { field: "topic", ktp: topic.into(), ksp: h.topic.clone() });
    }
    if h.section.trim() != section.trim() {
        out.push(FieldDrift { field: "section", ktp: section.into(), ksp: h.section.clone() });
    }
    let ksp_date = date_key(h.planned_date.as_deref());
    let ktp_date = date_key(date.as_deref());
    if ksp_date != ktp_date {
        out.push(FieldDrift { field: "plannedDate", ktp: ktp_date, ksp: ksp_date });
    }
    let mut ktp_codes: Vec<String> = serde_json::from_str::<Vec<Value>>(objectives_json)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.get("code")?.as_str().map(|s| s.trim().to_string()))
        .collect();
    let mut ksp_codes: Vec<String> = h.learning_objectives.iter().map(|o| o.code.trim().to_string()).collect();
    ktp_codes.sort();
    ksp_codes.sort();
    if ktp_codes != ksp_codes {
        out.push(FieldDrift {
            field: "learningObjectives",
            ktp: ktp_codes.join(", "),
            ksp: ksp_codes.join(", "),
        });
    }
    out
}

fn drift_json(items: &[FieldDrift]) -> Value {
    json!(items.iter().map(|d| json!({
        "field": d.field,
        "ktp": d.ktp,
        "ksp": d.ksp,
    })).collect::<Vec<_>>())
}

pub fn link_in_sync(has_ksp: bool, drift: &[FieldDrift]) -> bool {
    has_ksp && drift.is_empty()
}

fn objectives_from_json(raw: &str) -> Vec<LearningObjectiveRef> {
    serde_json::from_str::<Vec<Value>>(raw)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            Some(LearningObjectiveRef {
                code: v.get("code")?.as_str()?.into(),
                text: v.get("description").or_else(|| v.get("text")).and_then(|x| x.as_str()).unwrap_or("").into(),
            })
        })
        .collect()
}

fn lock_ksp_from_db_lesson(doc: &mut KspDocument, offer: &db::repo_ksp::LessonOfferRow) {
    let locked = KspHeader {
        section: offer.section_name.clone(),
        topic: offer.topic_title.clone(),
        learning_objectives: objectives_from_json(&offer.objectives_json),
        planned_date: offer.planned_date.clone(),
        class_name: doc.content.header.class_name.clone(),
        teacher_name: doc.content.header.teacher_name.clone(),
        lesson_goals: doc.content.header.lesson_goals.clone(),
        values_component: doc.content.header.values_component.clone(),
        success_criteria: doc.content.header.success_criteria.clone(),
        adapted_goal: offer.adapted_objective.clone(),
    };
    apply_locked_header(&mut doc.content.header, &locked);
}

async fn resolve_ids(state: &AppState, params: &Value) -> Result<(String, Option<KspDocument>, bool), String> {
    let lesson_hint = arg_str(params, &["lessonId", "ktpLessonId"]).ok();
    if let Ok(ksp_id) = arg_str(params, &["kspId"]) {
        if let Some((_, doc)) = crate::infra::ksp_mcp::peek_staged_document(&ksp_id)? {
            if let Some(hint) = &lesson_hint {
                if hint != &doc.ktp_lesson_id {
                    return Err(format!(
                        "kspId привязан к уроку {}, а не к {hint}. Один КСП — один урок КТП.",
                        doc.ktp_lesson_id
                    ));
                }
            }
            return Ok((doc.ktp_lesson_id.clone(), Some(doc), true));
        }
        let id = crate::domain::ids::KspId::from(uuid::Uuid::parse_str(&ksp_id).map_err(|e| e.to_string())?);
        let doc = db::repo_ksp::get_document(&state.pool, id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("КСП не найден: {ksp_id}"))?;
        if let Some(hint) = lesson_hint {
            if hint != doc.ktp_lesson_id {
                return Err(format!(
                    "kspId привязан к уроку {}, а не к {hint}. Один КСП — один урок КТП.",
                    doc.ktp_lesson_id
                ));
            }
        }
        return Ok((doc.ktp_lesson_id.clone(), Some(doc), false));
    }
    let lesson_id = lesson_hint.ok_or_else(|| "Нужен lessonId, ktpLessonId или kspId".to_string())?;
    if let Some((_, doc)) = crate::infra::ksp_mcp::peek_staged_by_lesson(&lesson_id)? {
        return Ok((lesson_id, Some(doc), true));
    }
    let doc = db::repo_ksp::get_by_lesson(&state.pool, &lesson_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok((lesson_id, doc, false))
}

pub async fn invoke(state: &AppState, tool: &str, params: Value) -> Result<Value, String> {
    match tool {
        "lesson_get_bundle" => {
            let (lesson_id, mut doc, ksp_staged) = resolve_ids(state, &params).await?;
            let db_lesson = db::repo_ksp::load_lesson_header(&state.pool, &lesson_id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Урок КТП не найден: {lesson_id}"))?;
            if let Some(d) = doc.as_mut() {
                lock_ksp_from_db_lesson(d, &db_lesson);
            }
            let mut lesson = db_lesson;
            let ktp_staged = overlay_offer_if_staged(&mut lesson)?;
            let mut neighbors = db::repo_ksp::neighbor_lessons(&state.pool, &lesson_id)
                .await
                .map_err(|e| e.to_string())?;
            for n in neighbors.iter_mut() {
                overlay_offer_if_staged(n)?;
            }
            let drift = doc.as_ref().map(|d| {
                header_drift(d, &lesson.topic_title, &lesson.section_name, &lesson.planned_date, &lesson.objectives_json)
            }).unwrap_or_default();
            Ok(json!({
                "link": {
                    "ktpLessonId": lesson_id,
                    "ktpPlanId": lesson.plan_id,
                    "kspId": doc.as_ref().map(|d| d.id.to_string()),
                    "hasKsp": doc.is_some(),
                    "inSync": link_in_sync(doc.is_some(), &drift),
                    "kspIsStaged": ksp_staged,
                    "ktpIsStaged": ktp_staged,
                },
                "lesson": lesson,
                "neighbors": neighbors,
                "ksp": doc.as_ref().map(|d| json!({
                    "id": d.id.to_string(),
                    "status": d.status,
                    "className": d.class_name,
                    "topic": d.content.header.topic,
                    "lessonGoals": d.content.header.lesson_goals,
                    "values": d.content.header.values_component,
                    "homework": d.content.homework,
                    "totalMinutes": d.content.total_minutes(),
                    "lessonDuration": d.content.lesson_duration,
                    "stages": d.content.stages.iter().map(|s| json!({
                        "id": s.id,
                        "type": s.stage_type,
                        "minutes": s.duration_minutes,
                    })).collect::<Vec<_>>(),
                })),
                "drift": drift_json(&drift),
            }))
        }
        "ksp_diff_with_ktp" => {
            let (lesson_id, doc, ksp_staged) = resolve_ids(state, &params).await?;
            let mut doc = doc.ok_or_else(|| "КСП для урока нет — сначала ksp_create_draft".to_string())?;
            let db_lesson = db::repo_ksp::load_lesson_header(&state.pool, &lesson_id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Урок КТП не найден: {lesson_id}"))?;
            lock_ksp_from_db_lesson(&mut doc, &db_lesson);
            let mut lesson = db_lesson;
            let ktp_staged = overlay_offer_if_staged(&mut lesson)?;
            let drift = header_drift(&doc, &lesson.topic_title, &lesson.section_name, &lesson.planned_date, &lesson.objectives_json);
            Ok(json!({
                "ktpLessonId": lesson_id,
                "kspId": doc.id.to_string(),
                "hasKsp": true,
                "inSync": link_in_sync(true, &drift),
                "kspIsStaged": ksp_staged,
                "ktpIsStaged": ktp_staged,
                "drift": drift_json(&drift),
            }))
        }
        "ksp_get_previous_summary" => {
            let lesson_id = arg_str(&params, &["ktpLessonId", "lessonId"])?;
            let prev = db::repo_ksp::previous_lesson(&state.pool, &lesson_id)
                .await
                .map_err(|e| e.to_string())?;
            let Some(prev) = prev else {
                return Ok(json!({ "found": false, "message": "Это первый урок плана." }));
            };
            let ksp = if let Some(id) = &prev.ksp_id {
                db::repo_ksp::get_document(
                    &state.pool,
                    crate::domain::ids::KspId::from(uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?),
                )
                .await
                .map_err(|e| e.to_string())?
            } else {
                None
            };
            Ok(json!({
                "found": true,
                "isPlanOnly": true,
                "skippedCancelled": prev.is_cancelled != 0,
                "lesson": prev,
                "kspId": prev.ksp_id,
                "homework": ksp.as_ref().map(|d| d.content.homework.text.clone()).unwrap_or_default(),
                "checkMethod": ksp.as_ref().map(|d| d.content.homework.check_method.clone()).unwrap_or_default(),
                "topic": prev.topic_title,
            }))
        }
        "ksp_get_stage" => {
            let ksp_id = arg_str(&params, &["kspId"])?;
            let stage_id = arg_str(&params, &["stageId"])?;
            let (doc, staged) = if let Some((_, doc)) = crate::infra::ksp_mcp::peek_staged_document(&ksp_id)? {
                (doc, true)
            } else {
                let id = crate::domain::ids::KspId::from(uuid::Uuid::parse_str(&ksp_id).map_err(|e| e.to_string())?);
                let doc = db::repo_ksp::get_document(&state.pool, id)
                    .await
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("КСП не найден: {ksp_id}"))?;
                (doc, false)
            };
            let stage = doc
                .content
                .stages
                .iter()
                .find(|s| s.id == stage_id)
                .ok_or_else(|| "Этап не найден".to_string())?;
            Ok(json!({ "kspId": ksp_id, "ktpLessonId": doc.ktp_lesson_id, "isStaged": staged, "stage": stage }))
        }
        other => Err(format!("Неизвестный инструмент связи: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ksp::{draft_from_template, KspDocument, KspHeader, KspStatus, LearningObjectiveRef, LessonGoals, ValuesComponent};
    use crate::domain::invariants::LessonKind;

    fn doc(topic: &str, section: &str) -> KspDocument {
        let header = KspHeader {
            section: section.into(),
            topic: topic.into(),
            learning_objectives: vec![LearningObjectiveRef { code: "8.1.1".into(), text: "цель".into() }],
            planned_date: Some("2026-01-21".into()),
            class_name: "8".into(),
            teacher_name: "Учитель".into(),
            lesson_goals: LessonGoals::default(),
            values_component: ValuesComponent::default(),
            success_criteria: vec![],
            adapted_goal: String::new(),
        };
        KspDocument {
            id: crate::domain::ids::KspId::new(),
            ktp_lesson_id: "l".into(),
            ktp_plan_id: "p".into(),
            teacher_id: "t".into(),
            class_name: "8".into(),
            status: KspStatus::Draft,
            language: "ru".into(),
            schema_version: 1,
            is_approved: false,
            content: draft_from_template(LessonKind::Standard, header, 45),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn drift_empty_when_header_matches() {
        let d = doc("Тема", "Раздел");
        let objs = r#"[{"code":"8.1.1"}]"#;
        assert!(header_drift(&d, "Тема", "Раздел", &Some("2026-01-21".into()), objs).is_empty());
    }

    #[test]
    fn drift_ignores_datetime_suffix() {
        let d = doc("Тема", "Раздел");
        assert!(header_drift(&d, "Тема", "Раздел", &Some("2026-01-21 00:00:00".into()), r#"[{"code":"8.1.1"}]"#).is_empty());
    }

    #[test]
    fn drift_ignores_objective_order() {
        let d = doc("Тема", "Раздел");
        assert!(header_drift(&d, "Тема", "Раздел", &Some("2026-01-21".into()), r#"[{"code":"8.1.1"}]"#).is_empty());
    }

    #[test]
    fn drift_reports_topic_mismatch() {
        let d = doc("Старая", "Раздел");
        let items = header_drift(&d, "Новая", "Раздел", &Some("2026-01-21".into()), r#"[{"code":"8.1.1"}]"#);
        assert!(items.iter().any(|i| i.field == "topic"));
    }

    #[test]
    fn in_sync_requires_existing_ksp() {
        assert!(!link_in_sync(false, &[]));
        assert!(link_in_sync(true, &[]));
        let d = doc("Старая", "Раздел");
        let items = header_drift(&d, "Новая", "Раздел", &Some("2026-01-21".into()), r#"[{"code":"8.1.1"}]"#);
        assert!(!link_in_sync(true, &items));
    }
}

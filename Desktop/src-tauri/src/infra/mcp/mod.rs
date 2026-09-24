//! Единый MCP-реестр КТП + КСП внутри ядра.
//! Нейронка не ходит в SQLite сама: только инструменты, мутации — через карантин.

use serde::Serialize;
use serde_json::{json, Value};

use crate::commands::AppState;

mod ktp;
mod link;
pub mod stdio;

pub use ktp::sync_ksp_header_from_lesson;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub mutating: bool,
    pub input_schema: Value,
}

fn tool(name: &str, description: &str, mutating: bool, schema: Value) -> ToolInfo {
    ToolInfo {
        name: name.into(),
        description: description.into(),
        mutating,
        input_schema: schema,
    }
}

fn obj(props: Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": true,
    })
}

pub fn list_tools() -> Vec<ToolInfo> {
    let s = |d| json!({ "type": "string", "description": d });
    let n = |d| json!({ "type": "integer", "description": d });
    vec![
        tool("ktp_list_plans", "Список планов КТП (предмет, класс, год, статус).", false, obj(json!({}), &[])),
        tool("ktp_get_plan_lessons", "Уроки плана КТП: id, номер, тема, дата, тип, есть ли КСП.", false, obj(json!({ "planId": s("id плана") }), &["planId"])),
        tool("ktp_find_lesson", "Поиск уроков КТП по предмету, классу, теме.", false, obj(json!({
            "topicQuery": s("фрагмент темы"), "grade": n("класс"), "subjectId": s("алгебра/геометрия"),
        }), &[])),
        tool("ktp_get_lesson", "Один урок КТП: раздел, тема, цели, дата, тип, связь с КСП.", false, obj(json!({ "lessonId": s("id урока") }), &["lessonId"])),
        tool("ktp_get_context", "Срез L(k-1), L(k), L(k+1) и привязанные КСП.", false, obj(json!({ "lessonId": s("id урока") }), &["lessonId"])),
        tool("ktp_get_section_progress", "Сколько уроков раздела уже с датой и с КСП.", false, obj(json!({ "lessonId": s("урок раздела") }), &["lessonId"])),
        tool("ktp_validate", "Инварианты СОР/СОЧ плана (FR-2.2, FR-2.3).", false, obj(json!({ "planId": s("id плана") }), &["planId"])),
        tool("ktp_update_lesson", "Правка темы, раздела, даты, типа, заметок урока КТП → карантин.", true, obj(json!({
            "lessonId": s("id"), "topicTitle": s("тема"), "sectionName": s("раздел"),
            "plannedDate": s("YYYY-MM-DD"), "lessonType": s("Standard|Sor|Soch|Revision"),
            "notes": s("ДЗ/заметка"), "isCancelled": { "type": "boolean" },
        }), &["lessonId"])),
        tool("ktp_set_lesson_objectives", "Цели урока КТП (код + текст) → карантин. КСП подхватит их при чтении.", true, obj(json!({
            "lessonId": s("id"),
            "objectives": { "type": "array", "items": { "type": "object", "properties": { "code": s("8.4.2.1"), "description": s("текст") } } },
        }), &["lessonId", "objectives"])),
        tool("ktp_commit_staged", "Записать карантин КТП в БД. Шапка связанного КСП синхронизируется.", true, obj(json!({ "stagedId": s("id карантина") }), &["stagedId"])),
        tool("ktp_discard_staged", "Отменить карантин КТП.", true, obj(json!({ "stagedId": s("id") }), &["stagedId"])),
        tool("lesson_get_bundle", "Связка урок КТП + КСП: дрейф темы/целей, соседи, саммари плана.", false, obj(json!({
            "lessonId": s("урок КТП"), "kspId": s("если нет lessonId"),
        }), &[])),
        tool("ksp_diff_with_ktp", "Расхождения шапки КСП с уроком КТП.", false, obj(json!({ "kspId": s("id"), "ktpLessonId": s("урок") }), &[])),
        tool("ksp_get_previous_summary", "Саммари предыдущего урока этого плана (для актуализации).", false, obj(json!({ "ktpLessonId": s("текущий урок") }), &["ktpLessonId"])),
        tool("ksp_get_stage", "Один этап КСП.", false, obj(json!({ "kspId": s("id"), "stageId": s("этап") }), &["kspId", "stageId"])),
        tool("ksp_list", "Список сохранённых КСП.", false, obj(json!({}), &[])),
        tool("ksp_get", "Полный КСП по kspId или ktpLessonId.", false, obj(json!({ "kspId": s("id"), "ktpLessonId": s("урок КТП") }), &[])),
        tool("ksp_get_summary", "Сжатое саммари КСП (план, не факт проведения).", false, obj(json!({ "kspId": s("id"), "ktpLessonId": s("урок") }), &[])),
        tool("ksp_validate", "Правила V-01…V-18. Если есть карантин — проверяет его, не БД.", false, obj(json!({ "kspId": s("id"), "ktpLessonId": s("урок, если нет kspId") }), &[])),
        tool("ksp_check_readiness", "Чек-лист готовности к уроку (карантин важнее БД).", false, obj(json!({ "kspId": s("id"), "ktpLessonId": s("урок") }), &[])),
        tool("ksp_create_draft", "Создать черновик КСП из урока КТП (UNIQUE на урок).", true, obj(json!({
            "ktpLessonId": s("урок"), "className": s("8А"), "lessonDuration": n("минуты"),
        }), &["ktpLessonId"])),
        tool("ksp_update_stage", "Правка этапа КСП → карантин.", true, obj(json!({ "kspId": s("id"), "stageId": s("этап") }), &["kspId", "stageId"])),
        tool("ksp_add_stage", "Добавить этап КСП → карантин.", true, obj(json!({ "kspId": s("id"), "type": s("practice") }), &["kspId"])),
        tool("ksp_remove_stage", "Удалить этап → карантин.", true, obj(json!({ "kspId": s("id"), "stageId": s("этап") }), &["kspId", "stageId"])),
        tool("ksp_reorder_stages", "Порядок этапов → карантин.", true, obj(json!({ "kspId": s("id"), "order": { "type": "array", "items": { "type": "string" } } }), &["kspId", "order"])),
        tool("ksp_set_homework", "Домашнее задание КСП → карантин.", true, obj(json!({ "kspId": s("id") }), &["kspId"])),
        tool("ksp_update_header", "Цели урока и ценности КСП. Тему/цели ТУП меняйте через ktp_update_lesson.", true, obj(json!({ "kspId": s("id") }), &["kspId"])),
        tool("ksp_rebalance_time", "Пересчитать минуты до эталона → карантин.", true, obj(json!({ "kspId": s("id") }), &["kspId"])),
        tool("ksp_commit_staged", "Запись карантина КСП в БД.", true, obj(json!({ "stagedId": s("id") }), &["stagedId"])),
        tool("ksp_discard_staged", "Отменить карантин КСП.", true, obj(json!({ "stagedId": s("id") }), &["stagedId"])),
    ]
}

pub fn normalize_params(params: Value) -> Value {
    const MAP: &[(&str, &str)] = &[
        ("lesson_id", "lessonId"),
        ("ktp_lesson_id", "ktpLessonId"),
        ("ksp_id", "kspId"),
        ("plan_id", "planId"),
        ("subject_id", "subjectId"),
        ("topic_query", "topicQuery"),
        ("class_name", "className"),
        ("lesson_duration", "lessonDuration"),
        ("staged_id", "stagedId"),
        ("stage_id", "stageId"),
        ("teacher_actions", "teacherActions"),
        ("student_actions", "studentActions"),
        ("duration_minutes", "durationMinutes"),
        ("check_method", "checkMethod"),
        ("values_text", "valuesText"),
        ("lesson_goal_all", "lessonGoalAll"),
        ("topic_title", "topicTitle"),
        ("section_name", "sectionName"),
        ("planned_date", "plannedDate"),
        ("lesson_type", "lessonType"),
        ("is_cancelled", "isCancelled"),
        ("value_ids", "valueIds"),
        ("lesson_goal_most", "lessonGoalMost"),
        ("lesson_goal_some", "lessonGoalSome"),
        ("learning_objectives", "learningObjectives"),
    ];
    let mut params = params;
    if let Some(obj) = params.as_object_mut() {
        for (snake, camel) in MAP {
            if !obj.contains_key(*camel) {
                if let Some(v) = obj.get(*snake).cloned() {
                    obj.insert((*camel).into(), v);
                }
            }
        }
    }
    params
}

pub fn arg_str(params: &Value, names: &[&str]) -> Result<String, String> {
    for n in names {
        if let Some(s) = params.get(*n).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return Ok(s.to_string());
        }
    }
    Err(format!("Нужен параметр {}", names.first().copied().unwrap_or("?")))
}

pub fn arg_i64(params: &Value, names: &[&str]) -> Option<i64> {
    for n in names {
        let Some(v) = params.get(*n) else { continue };
        if let Some(i) = v.as_i64() {
            return Some(i);
        }
        if let Some(f) = v.as_f64() {
            return Some(f as i64);
        }
        if let Some(s) = v.as_str() {
            if let Ok(i) = s.trim().parse::<i64>() {
                return Some(i);
            }
        }
    }
    None
}

pub fn arg_bool(params: &Value, names: &[&str]) -> Option<bool> {
    for n in names {
        let Some(v) = params.get(*n) else { continue };
        if let Some(b) = v.as_bool() {
            return Some(b);
        }
        if let Some(i) = v.as_i64() {
            return Some(i != 0);
        }
        if let Some(s) = v.as_str() {
            match s.trim().to_ascii_lowercase().as_str() {
                "true" | "1" | "yes" => return Some(true),
                "false" | "0" | "no" => return Some(false),
                _ => {}
            }
        }
    }
    None
}

pub async fn invoke(state: &AppState, tool: &str, params: Value) -> Result<Value, String> {
    let params = normalize_params(params);
    match tool {
        "ktp_list_plans"
        | "ktp_get_plan_lessons"
        | "ktp_find_lesson"
        | "ktp_get_lesson"
        | "ktp_get_context"
        | "ktp_get_section_progress"
        | "ktp_validate"
        | "ktp_update_lesson"
        | "ktp_set_lesson_objectives"
        | "ktp_commit_staged"
        | "ktp_discard_staged" => ktp::invoke(state, tool, params).await,
        "lesson_get_bundle" | "ksp_diff_with_ktp" | "ksp_get_previous_summary" | "ksp_get_stage" => {
            link::invoke(state, tool, params).await
        }
        other => crate::infra::ksp_mcp::invoke(state, other, params).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_accepts_snake_case() {
        let v = normalize_params(json!({ "ktp_lesson_id": "abc", "topic_query": "квадрат", "learning_objectives": [] }));
        assert_eq!(v["ktpLessonId"], "abc");
        assert_eq!(v["topicQuery"], "квадрат");
        assert!(v.get("learningObjectives").is_some());
    }

    #[test]
    fn arg_str_skips_empty() {
        let v = json!({ "kspId": "", "ktpLessonId": "lesson-1" });
        assert_eq!(arg_str(&v, &["kspId", "ktpLessonId"]).unwrap(), "lesson-1");
    }

    #[test]
    fn arg_i64_accepts_string() {
        let v = json!({ "grade": "8", "durationMinutes": 5.0 });
        assert_eq!(arg_i64(&v, &["grade"]), Some(8));
        assert_eq!(arg_i64(&v, &["durationMinutes"]), Some(5));
    }

    #[test]
    fn arg_bool_accepts_number() {
        assert_eq!(arg_bool(&json!({ "isCancelled": 1 }), &["isCancelled"]), Some(true));
        assert_eq!(arg_bool(&json!({ "isCancelled": "false" }), &["isCancelled"]), Some(false));
    }

    #[test]
    fn registry_covers_ktp_and_ksp_and_link() {
        let names: Vec<_> = list_tools().into_iter().map(|t| t.name).collect();
        assert!(names.contains(&"ktp_update_lesson".into()));
        assert!(names.contains(&"ksp_create_draft".into()));
        assert!(names.contains(&"lesson_get_bundle".into()));
        assert!(names.contains(&"ksp_diff_with_ktp".into()));
    }
}

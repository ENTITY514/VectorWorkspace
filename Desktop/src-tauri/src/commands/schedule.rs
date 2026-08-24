use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;
use crate::db::schedule::{curriculum, rooms, slots, subjects, teachers};
#[derive(Debug, Serialize)]
pub struct ScheduleStateDto {
    pub teachers: Vec<crate::domain::schedule::model::ScheduleTeacher>,
    pub rooms: Vec<crate::domain::schedule::model::ScheduleRoom>,
    pub classes: Vec<crate::domain::schedule::model::ScheduleClass>,
    pub subgroup_rules: Vec<crate::domain::schedule::model::ScheduleSubgroupRule>,
    pub subjects: Vec<crate::domain::schedule::model::ScheduleSubject>,
    pub curriculum: Vec<crate::domain::schedule::model::ScheduleCurriculum>,
    pub weights: crate::domain::schedule::model::ScheduleWeights,
    pub slots: Vec<crate::domain::schedule::model::ScheduleSlot>,
}

#[tauri::command]
pub async fn schedule_get_state(state: State<'_, AppState>) -> Result<ScheduleStateDto, String> {
    let pool = &state.pool;
    let t = teachers::list_teachers(pool).await.map_err(|e| e.to_string())?;
    let r = rooms::list_rooms(pool).await.map_err(|e| e.to_string())?;
    let subj = subjects::list_subjects(pool).await.map_err(|e| e.to_string())?;
    let curr = curriculum::list_curriculum(pool).await.map_err(|e| e.to_string())?;
    let sr = curriculum::list_subgroup_rules(pool).await.map_err(|e| e.to_string())?;
    let w = slots::get_weights(pool).await.map_err(|e| e.to_string())?;
    let sl = slots::list_slots(pool).await.map_err(|e| e.to_string())?;

    // classes
    let classes_rows = sqlx::query_as::<_, (String, i64, String, i64, String)>(
        "SELECT id, grade, letter, headcount, shift FROM schedule_classes ORDER BY grade, letter",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let classes = classes_rows
        .into_iter()
        .map(|(id, grade, letter, headcount, shift)| crate::domain::schedule::model::ScheduleClass {
            id,
            grade,
            letter,
            headcount,
            shift,
        })
        .collect();

    Ok(ScheduleStateDto {
        teachers: t,
        rooms: r,
        classes,
        subgroup_rules: sr,
        subjects: subj,
        curriculum: curr,
        weights: w,
        slots: sl,
    })
}

#[derive(Debug, Deserialize)]
pub struct UpsertTeacherInput {
    pub id: Option<String>,
    pub full_name: String,
    pub base_room_id: Option<String>,
    pub max_daily_lessons: i64,
    pub availability_json: String,
}

#[tauri::command]
pub async fn schedule_upsert_teacher(state: State<'_, AppState>, input: UpsertTeacherInput) -> Result<crate::domain::schedule::model::ScheduleTeacher, String> {
    teachers::upsert_teacher(
        &state.pool,
        input.id,
        input.full_name,
        input.base_room_id,
        input.max_daily_lessons,
        input.availability_json,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_delete_teacher(state: State<'_, AppState>, id: String) -> Result<(), String> {
    teachers::delete_teacher(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpsertRoomInput {
    pub id: Option<String>,
    pub name: String,
    pub room_type: String,
    pub capacity: i64,
    pub base_teacher_id: Option<String>,
    pub floor: Option<i64>,
}

#[tauri::command]
pub async fn schedule_upsert_room(state: State<'_, AppState>, input: UpsertRoomInput) -> Result<crate::domain::schedule::model::ScheduleRoom, String> {
    rooms::upsert_room(
        &state.pool,
        input.id,
        input.name,
        input.room_type,
        input.capacity,
        input.base_teacher_id,
        input.floor,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_delete_room(state: State<'_, AppState>, id: String) -> Result<(), String> {
    rooms::delete_room(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpsertClassInput {
    pub id: Option<String>,
    pub grade: i64,
    pub letter: String,
    pub headcount: i64,
    pub shift: String,
}

#[tauri::command]
pub async fn schedule_upsert_class(state: State<'_, AppState>, input: UpsertClassInput) -> Result<crate::domain::schedule::model::ScheduleClass, String> {
    crate::domain::schedule::validation::validate_grade(input.grade).map_err(|e| e.to_string())?;
    crate::domain::schedule::validation::validate_headcount(input.headcount).map_err(|e| e.to_string())?;
    crate::domain::schedule::validation::validate_name(&input.letter).map_err(|e| e.to_string())?;
    if crate::domain::schedule::model::Shift::from_str(&input.shift).is_none() {
        return Err(format!("unknown shift: {}", input.shift));
    }
    let cid = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET grade=?2, letter=?3, headcount=?4, shift=?5",
    )
    .bind(&cid)
    .bind(input.grade)
    .bind(&input.letter)
    .bind(input.headcount)
    .bind(&input.shift)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(crate::domain::schedule::model::ScheduleClass {
        id: cid,
        grade: input.grade,
        letter: input.letter,
        headcount: input.headcount,
        shift: input.shift,
    })
}

#[tauri::command]
pub async fn schedule_delete_class(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM schedule_classes WHERE id=?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct UpsertSubjectInput {
    pub id: String,
    pub name: String,
    pub sanitary_weight: i64,
    pub required_room_type: Option<String>,
    pub requires_split: bool,
    pub is_double_allowed: bool,
    pub related_subjects_json: String,
}

#[tauri::command]
pub async fn schedule_upsert_subject(state: State<'_, AppState>, input: UpsertSubjectInput) -> Result<crate::domain::schedule::model::ScheduleSubject, String> {
    subjects::upsert_subject(
        &state.pool,
        input.id,
        input.name,
        input.sanitary_weight,
        input.required_room_type,
        input.requires_split,
        input.is_double_allowed,
        input.related_subjects_json,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_delete_subject(state: State<'_, AppState>, id: String) -> Result<(), String> {
    subjects::delete_subject(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpsertSubgroupRuleInput {
    pub class_id: String,
    pub subject_id: String,
    pub group_count: i64,
}

#[tauri::command]
pub async fn schedule_upsert_subgroup_rule(state: State<'_, AppState>, input: UpsertSubgroupRuleInput) -> Result<String, String> {
    subjects::upsert_subgroup_rule(&state.pool, input.class_id, input.subject_id, input.group_count)
        .await
        .map_err(|e| e.to_string())?;
    Ok("ok".to_string())
}

#[derive(Debug, Deserialize)]
pub struct CurriculumEntryInput {
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub split_teacher2_id: Option<String>,
    pub hours_per_week: i64,
}

#[tauri::command]
pub async fn schedule_set_curriculum(state: State<'_, AppState>, entries: Vec<CurriculumEntryInput>) -> Result<Vec<crate::domain::schedule::model::ScheduleCurriculum>, String> {
    let tuples = entries
        .into_iter()
        .map(|e| (e.class_id, e.subject_id, e.teacher_id, e.split_teacher2_id, e.hours_per_week))
        .collect();
    curriculum::set_curriculum_entries(&state.pool, tuples)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct SetWeightsInput {
    pub window: i64,
    pub room_displacement: i64,
    pub sanpin_parabola: i64,
    pub alternation: i64,
    pub movement: i64,
    pub load_balance: i64,
}

#[tauri::command]
pub async fn schedule_set_weights(state: State<'_, AppState>, input: SetWeightsInput) -> Result<crate::domain::schedule::model::ScheduleWeights, String> {
    slots::set_weights(
        &state.pool,
        input.window,
        input.room_displacement,
        input.sanpin_parabola,
        input.alternation,
        input.movement,
        input.load_balance,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_clear_slots(state: State<'_, AppState>) -> Result<(), String> {
    slots::clear_slots(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_get_slots(state: State<'_, AppState>) -> Result<Vec<crate::domain::schedule::model::ScheduleSlot>, String> {
    slots::list_slots(&state.pool).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct GenerateInput {
    pub time_limit_sec: Option<i64>,
    pub num_workers: Option<i64>,
    pub seed: Option<i64>,
}

#[tauri::command]
pub async fn schedule_generate(state: State<'_, AppState>, input: Option<GenerateInput>) -> Result<serde_json::Value, String> {
    let pool = &state.pool;
    // собрать входной JSON из БД
    let teachers_db = teachers::list_teachers(pool).await.map_err(|e| e.to_string())?;
    let rooms_db = rooms::list_rooms(pool).await.map_err(|e| e.to_string())?;
    let subjects_db = subjects::list_subjects(pool).await.map_err(|e| e.to_string())?;
    let curriculum_db = curriculum::list_curriculum(pool).await.map_err(|e| e.to_string())?;
    let subgroup_rules = curriculum::list_subgroup_rules(pool).await.map_err(|e| e.to_string())?;
    let weights_db = slots::get_weights(pool).await.map_err(|e| e.to_string())?;

    let classes_rows = sqlx::query_as::<_, (String, i64, String, i64, String)>(
        "SELECT id, grade, letter, headcount, shift FROM schedule_classes",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let tl = input.as_ref().and_then(|i| i.time_limit_sec).unwrap_or(60);
    let nw = input.as_ref().and_then(|i| i.num_workers).unwrap_or(8);
    let seed = input.as_ref().and_then(|i| i.seed).unwrap_or(42);

    // build InputModel JSON (camelCase по схеме pydantic)
    let teachers_json: Vec<serde_json::Value> = teachers_db
        .into_iter()
        .map(|t| {
            let avail: serde_json::Value = serde_json::from_str(&t.availability_json).unwrap_or_else(|_| {
                let row = serde_json::json!([true,true,true,true,true,true,true,true]);
                serde_json::json!([row.clone(), row.clone(), row.clone(), row.clone(), row.clone(), row.clone()])
            });
            serde_json::json!({
                "id": t.id,
                "full_name": t.full_name,
                "base_room_id": t.base_room_id,
                "max_daily_lessons": t.max_daily_lessons,
                "availability": avail
            })
        })
        .collect();

    let classes_json: Vec<serde_json::Value> = classes_rows
        .into_iter()
        .map(|(id, grade, letter, headcount, shift)| {
            let sg: Vec<serde_json::Value> = subgroup_rules
                .iter()
                .filter(|r| r.class_id == id)
                .map(|r| serde_json::json!({"subject_id": r.subject_id, "group_count": r.group_count}))
                .collect();
            serde_json::json!({
                "id": id,
                "grade": grade,
                "letter": letter,
                "headcount": headcount,
                "shift": shift,
                "subgroups": sg
            })
        })
        .collect();

    let rooms_json: Vec<serde_json::Value> = rooms_db
        .into_iter()
        .map(|r| serde_json::json!({
            "id": r.id,
            "name": r.name,
            "room_type": r.room_type,
            "capacity": r.capacity,
            "floor": r.floor
        }))
        .collect();

    let subjects_json: Vec<serde_json::Value> = subjects_db
        .into_iter()
        .map(|s| {
            let related: Vec<String> = serde_json::from_str(&s.related_subjects_json).unwrap_or_default();
            serde_json::json!({
                "id": s.id,
                "name": s.name,
                "sanitary_weight": s.sanitary_weight,
                "required_room_type": s.required_room_type,
                "requires_split": s.requires_split,
                "is_double_allowed": s.is_double_allowed,
                "related_subject_ids": related
            })
        })
        .collect();

    let curriculum_json: Vec<serde_json::Value> = curriculum_db
        .into_iter()
        .map(|c| serde_json::json!({
            "class_id": c.class_id,
            "subject_id": c.subject_id,
            "teacher_id": c.teacher_id,
            "split_teacher2_id": c.split_teacher2_id,
            "hours_per_week": c.hours_per_week
        }))
        .collect();

    let input_json = serde_json::json!({
        "schema_version": 1,
        "meta": {
            "school_name": "Vector",
            "generated_at": chrono::Utc::now().to_rfc3339(),
            "time_limit_sec": tl,
            "num_workers": nw,
            "random_seed": seed
        },
        "time_grid": {
            "days": 6,
            "periods_per_day": 7
        },
        "teachers": teachers_json,
        "classes": classes_json,
        "rooms": rooms_json,
        "subjects": subjects_json,
        "curriculum": curriculum_json,
        "weights": {
            "window": weights_db.window,
            "room_displacement": weights_db.room_displacement,
            "sanpin_parabola": weights_db.sanpin_parabola,
            "alternation": weights_db.alternation,
            "movement": weights_db.movement,
            "load_balance": weights_db.load_balance
        }
    });

    // вызвать солвер
    let solver_script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../solver/__main__.py");
    let python_bin = crate::infra::solver_host::SolverHost::default_python();
    let host = crate::infra::solver_host::SolverHost::new(python_bin, solver_script);
    let output = host.run(input_json).await.map_err(|e| e.to_string())?;

    // при OPTIMAL/FEASIBLE — валидировать и коммитить
    if output.status == "OPTIMAL" || output.status == "FEASIBLE" {
        crate::infra::solver_host::SolverHost::validate_hard(&output.slots).map_err(|e| e.to_string())?;
        // транзакция
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM schedule_slots").execute(&mut *tx).await.map_err(|e| e.to_string())?;
        for slot in &output.slots {
            let id = uuid::Uuid::new_v4().to_string();
            let class_id = slot.get("class_id").and_then(|v| v.as_str()).unwrap_or("");
            let subject_id = slot.get("subject_id").and_then(|v| v.as_str()).unwrap_or("");
            let teacher_id = slot.get("teacher_id").and_then(|v| v.as_str()).unwrap_or("");
            let room_id = slot.get("room_id").and_then(|v| v.as_str()).unwrap_or("");
            let subgroup = slot.get("subgroup_label").and_then(|v| v.as_str()).unwrap_or("");
            let day = slot.get("day").and_then(|v| v.as_i64()).unwrap_or(0);
            let period = slot.get("period").and_then(|v| v.as_i64()).unwrap_or(0);
            sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
                .bind(&id)
                .bind(class_id)
                .bind(subject_id)
                .bind(teacher_id)
                .bind(room_id)
                .bind(subgroup)
                .bind(day)
                .bind(period)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())?;
    }

    serde_json::to_value(&output).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_export(state: State<'_, AppState>, format: Option<String>) -> Result<String, String> {
    let pool = &state.pool;
    let slots = slots::list_slots(pool).await.map_err(|e| e.to_string())?;
    if format.as_deref() == Some("json") {
        return serde_json::to_string(&slots).map_err(|e| e.to_string());
    }
    let mut out = String::from("class_id,subject_id,teacher_id,room_id,subgroup_label,day,period\n");
    for s in &slots {
        let label = s.subgroup_label.clone().unwrap_or_default();
        out.push_str(&format!("{},{},{},{},{},{},{}\n", s.class_id, s.subject_id, s.teacher_id, s.room_id, label, s.day, s.period));
    }
    Ok(out)
}

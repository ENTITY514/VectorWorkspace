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

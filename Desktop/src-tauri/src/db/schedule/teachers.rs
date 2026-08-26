use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::DbError;
use crate::domain::schedule::model::{AvailabilityMatrix, ScheduleTeacher};
use crate::domain::schedule::validation;

pub async fn list_teachers(pool: &SqlitePool) -> Result<Vec<ScheduleTeacher>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, i64, String, String, bool)>(
        "SELECT id, full_name, base_room_id, max_daily_lessons, availability_json, subject_ids, is_combined FROM schedule_teachers ORDER BY full_name",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, full_name, base_room_id, max_daily_lessons, availability_json, subject_ids, is_combined)| ScheduleTeacher {
            id,
            full_name,
            base_room_id,
            max_daily_lessons,
            availability_json,
            subject_ids,
            is_combined,
        })
        .collect())
}

pub async fn upsert_teacher(
    pool: &SqlitePool,
    id: Option<String>,
    full_name: String,
    base_room_id: Option<String>,
    max_daily_lessons: i64,
    availability_json: String,
    subject_ids: String,
    is_combined: bool,
) -> Result<ScheduleTeacher, DbError> {
    validation::validate_name(&full_name).map_err(|e| DbError::Validation(e.to_string()))?;
    if !(0..=10).contains(&max_daily_lessons) {
        return Err(DbError::Validation("max_daily_lessons 0..10".to_string()));
    }
    let m = AvailabilityMatrix::from_json(&availability_json).map_err(DbError::Validation)?;
    validation::validate_availability(&m).map_err(|e| DbError::Validation(e.to_string()))?;

    let tid = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO schedule_teachers (id, full_name, base_room_id, max_daily_lessons, availability_json, subject_ids, is_combined)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET full_name=?2, base_room_id=?3, max_daily_lessons=?4, availability_json=?5, subject_ids=?6, is_combined=?7",
    )
    .bind(&tid)
    .bind(&full_name)
    .bind(&base_room_id)
    .bind(max_daily_lessons)
    .bind(&availability_json)
    .bind(&subject_ids)
    .bind(is_combined)
    .execute(pool)
    .await?;

    Ok(ScheduleTeacher {
        id: tid,
        full_name,
        base_room_id,
        max_daily_lessons,
        availability_json,
        subject_ids,
        is_combined,
    })
}

pub async fn delete_teacher(pool: &SqlitePool, id: &str) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_teachers WHERE id=?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

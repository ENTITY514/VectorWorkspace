use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::DbError;
use crate::domain::schedule::model::{RoomType, ScheduleSubject};
use crate::domain::schedule::validation;

pub async fn list_subjects(pool: &SqlitePool) -> Result<Vec<ScheduleSubject>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, i64, Option<String>, i64, i64, String)>(
        "SELECT id, name, sanitary_weight, required_room_type, requires_split, is_double_allowed, related_subjects_json FROM schedule_subjects ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, sanitary_weight, required_room_type, requires_split, is_double_allowed, related_subjects_json)| ScheduleSubject {
            id,
            name,
            sanitary_weight,
            required_room_type,
            requires_split: requires_split != 0,
            is_double_allowed: is_double_allowed != 0,
            related_subjects_json,
        })
        .collect())
}

pub async fn upsert_subject(
    pool: &SqlitePool,
    id: String,
    name: String,
    sanitary_weight: i64,
    required_room_type: Option<String>,
    requires_split: bool,
    is_double_allowed: bool,
    related_subjects_json: String,
) -> Result<ScheduleSubject, DbError> {
    validation::validate_name(&name).map_err(|e| DbError::Validation(e.to_string()))?;
    validation::validate_name(&id).map_err(|e| DbError::Validation(e.to_string()))?;
    validation::validate_sanitary_weight(sanitary_weight).map_err(|e| DbError::Validation(e.to_string()))?;
    if let Some(ref rt) = required_room_type {
        if RoomType::from_str(rt).is_none() {
            return Err(DbError::Validation(format!("unknown room_type: {}", rt)));
        }
    }
    // related must be valid JSON
    if serde_json::from_str::<serde_json::Value>(&related_subjects_json).is_err() {
        return Err(DbError::Validation("related_subjects_json must be JSON".to_string()));
    }

    sqlx::query(
        "INSERT INTO schedule_subjects (id, name, sanitary_weight, required_room_type, requires_split, is_double_allowed, related_subjects_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET name=?2, sanitary_weight=?3, required_room_type=?4, requires_split=?5, is_double_allowed=?6, related_subjects_json=?7",
    )
    .bind(&id)
    .bind(&name)
    .bind(sanitary_weight)
    .bind(&required_room_type)
    .bind(if requires_split { 1 } else { 0 })
    .bind(if is_double_allowed { 1 } else { 0 })
    .bind(&related_subjects_json)
    .execute(pool)
    .await?;

    Ok(ScheduleSubject {
        id,
        name,
        sanitary_weight,
        required_room_type,
        requires_split,
        is_double_allowed,
        related_subjects_json,
    })
}

pub async fn delete_subject(pool: &SqlitePool, id: &str) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_subjects WHERE id=?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_subgroup_rule(
    pool: &SqlitePool,
    class_id: String,
    subject_id: String,
    group_count: i64,
) -> Result<(), DbError> {
    validation::validate_group_count(group_count).map_err(|e| DbError::Validation(e.to_string()))?;
    let rid = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO schedule_subgroup_rules (id, class_id, subject_id, group_count) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(class_id, subject_id) DO UPDATE SET group_count=?4",
    )
    .bind(&rid)
    .bind(&class_id)
    .bind(&subject_id)
    .bind(group_count)
    .execute(pool)
    .await?;
    Ok(())
}

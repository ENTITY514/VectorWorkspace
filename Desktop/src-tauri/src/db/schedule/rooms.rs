use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::DbError;
use crate::domain::schedule::model::{RoomType, ScheduleRoom};
use crate::domain::schedule::validation;

pub async fn list_rooms(pool: &SqlitePool) -> Result<Vec<ScheduleRoom>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, i64, Option<String>, Option<i64>)>(
        "SELECT id, name, room_type, capacity, base_teacher_id, floor FROM schedule_rooms ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, room_type, capacity, base_teacher_id, floor)| ScheduleRoom {
            id,
            name,
            room_type,
            capacity,
            base_teacher_id,
            floor,
        })
        .collect())
}

pub async fn upsert_room(
    pool: &SqlitePool,
    id: Option<String>,
    name: String,
    room_type: String,
    capacity: i64,
    base_teacher_id: Option<String>,
    floor: Option<i64>,
) -> Result<ScheduleRoom, DbError> {
    validation::validate_name(&name).map_err(|e| DbError::Validation(e.to_string()))?;
    if RoomType::from_str(&room_type).is_none() {
        return Err(DbError::Validation(format!("unknown room_type: {}", room_type)));
    }
    validation::validate_capacity(capacity).map_err(|e| DbError::Validation(e.to_string()))?;
    if let Some(f) = floor {
        if !(1..=5).contains(&f) {
            return Err(DbError::Validation("floor 1..5".to_string()));
        }
    }

    let rid = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO schedule_rooms (id, name, room_type, capacity, base_teacher_id, floor)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET name=?2, room_type=?3, capacity=?4, base_teacher_id=?5, floor=?6",
    )
    .bind(&rid)
    .bind(&name)
    .bind(&room_type)
    .bind(capacity)
    .bind(&base_teacher_id)
    .bind(floor)
    .execute(pool)
    .await?;

    Ok(ScheduleRoom {
        id: rid,
        name,
        room_type,
        capacity,
        base_teacher_id,
        floor,
    })
}

pub async fn delete_room(pool: &SqlitePool, id: &str) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_rooms WHERE id=?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

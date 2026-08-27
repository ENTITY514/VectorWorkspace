use sqlx::SqlitePool;

use crate::db::DbError;
use crate::domain::schedule::model::{ScheduleSlot, ScheduleWeights};

pub async fn get_weights(pool: &SqlitePool) -> Result<ScheduleWeights, DbError> {
    let row = sqlx::query_as::<_, (String, i64, i64, i64, i64, i64, i64, i64)>(
        "SELECT id, window, room_displacement, sanpin_parabola, alternation, movement, load_balance, change_slot FROM schedule_weights WHERE id='default'",
    )
    .fetch_one(pool)
    .await?;
    Ok(ScheduleWeights {
        id: row.0,
        window: row.1,
        room_displacement: row.2,
        sanpin_parabola: row.3,
        alternation: row.4,
        movement: row.5,
        load_balance: row.6,
        change_slot: row.7,
    })
}

pub async fn set_weights(
    pool: &SqlitePool,
    window: i64,
    room_displacement: i64,
    sanpin_parabola: i64,
    alternation: i64,
    movement: i64,
    load_balance: i64,
    change_slot: i64,
) -> Result<ScheduleWeights, DbError> {
    for v in [window, room_displacement, sanpin_parabola, alternation, movement, load_balance, change_slot] {
        if !(0..=1000).contains(&v) {
            return Err(DbError::Validation("weights 0..1000".to_string()));
        }
    }
    sqlx::query(
        "UPDATE schedule_weights SET window=?1, room_displacement=?2, sanpin_parabola=?3, alternation=?4, movement=?5, load_balance=?6, change_slot=?7 WHERE id='default'",
    )
    .bind(window)
    .bind(room_displacement)
    .bind(sanpin_parabola)
    .bind(alternation)
    .bind(movement)
    .bind(load_balance)
    .bind(change_slot)
    .execute(pool)
    .await?;
    get_weights(pool).await
}

pub async fn list_slots(pool: &SqlitePool) -> Result<Vec<ScheduleSlot>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, String, Option<String>)>(
        "SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id FROM schedule_slots ORDER BY day, period",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)| ScheduleSlot {
            id,
            class_id,
            subject_id,
            teacher_id,
            room_id,
            subgroup_label: if subgroup_label.is_empty() { None } else { Some(subgroup_label) },
            day,
            period,
            is_double: is_double != 0,
            joint_lesson_id,
            week: None,
            source_subject: None,
            source_teacher: None,
            source_time: None,
            source_note: None,
            variant_id: Some(variant_id),
        })
        .collect())
}

pub async fn list_slots_for_variant(pool: &SqlitePool, variant_id: &str) -> Result<Vec<ScheduleSlot>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, Option<String>)>(
        "SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, joint_lesson_id FROM schedule_slots WHERE variant_id = ?1 ORDER BY day, period",
    )
    .bind(variant_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, joint_lesson_id)| ScheduleSlot {
            id,
            class_id,
            subject_id,
            teacher_id,
            room_id,
            subgroup_label: if subgroup_label.is_empty() { None } else { Some(subgroup_label) },
            day,
            period,
            is_double: is_double != 0,
            joint_lesson_id,
            week: None,
            source_subject: None,
            source_teacher: None,
            source_time: None,
            source_note: None,
            variant_id: Some(variant_id.to_string()),
        })
        .collect())
}

pub async fn get_active_variant_id(pool: &SqlitePool) -> Result<String, DbError> {
    let id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM schedule_variants WHERE is_active = 1 LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(id.unwrap_or_else(|| "default".to_string()))
}

pub async fn clear_slots(pool: &SqlitePool, variant_id: &str) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1")
        .bind(variant_id)
        .execute(pool)
        .await?;
    Ok(())
}

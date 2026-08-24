use sqlx::SqlitePool;

use crate::db::DbError;
use crate::domain::schedule::model::{ScheduleSlot, ScheduleWeights};

pub async fn get_weights(pool: &SqlitePool) -> Result<ScheduleWeights, DbError> {
    let row = sqlx::query_as::<_, (String, i64, i64, i64, i64, i64, i64)>(
        "SELECT id, window, room_displacement, sanpin_parabola, alternation, movement, load_balance FROM schedule_weights WHERE id='default'",
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
) -> Result<ScheduleWeights, DbError> {
    for v in [window, room_displacement, sanpin_parabola, alternation, movement, load_balance] {
        if !(0..=1000).contains(&v) {
            return Err(DbError::Validation("weights 0..1000".to_string()));
        }
    }
    sqlx::query(
        "UPDATE schedule_weights SET window=?1, room_displacement=?2, sanpin_parabola=?3, alternation=?4, movement=?5, load_balance=?6 WHERE id='default'",
    )
    .bind(window)
    .bind(room_displacement)
    .bind(sanpin_parabola)
    .bind(alternation)
    .bind(movement)
    .bind(load_balance)
    .execute(pool)
    .await?;
    get_weights(pool).await
}

pub async fn list_slots(pool: &SqlitePool) -> Result<Vec<ScheduleSlot>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64)>(
        "SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double FROM schedule_slots ORDER BY day, period",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double)| ScheduleSlot {
            id,
            class_id,
            subject_id,
            teacher_id,
            room_id,
            subgroup_label: if subgroup_label.is_empty() { None } else { Some(subgroup_label) },
            day,
            period,
            is_double: is_double != 0,
        })
        .collect())
}

pub async fn clear_slots(pool: &SqlitePool) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_slots").execute(pool).await?;
    Ok(())
}

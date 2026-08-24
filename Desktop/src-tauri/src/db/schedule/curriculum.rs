use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::DbError;
use crate::domain::schedule::model::{ScheduleCurriculum, ScheduleSubgroupRule};
use crate::domain::schedule::validation;

pub async fn list_curriculum(pool: &SqlitePool) -> Result<Vec<ScheduleCurriculum>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, i64)>(
        "SELECT id, class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week FROM schedule_curriculum",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week)| ScheduleCurriculum {
            id,
            class_id,
            subject_id,
            teacher_id,
            split_teacher2_id,
            hours_per_week,
        })
        .collect())
}

pub async fn list_subgroup_rules(pool: &SqlitePool) -> Result<Vec<ScheduleSubgroupRule>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, i64)>(
        "SELECT id, class_id, subject_id, group_count FROM schedule_subgroup_rules",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, class_id, subject_id, group_count)| ScheduleSubgroupRule {
            id,
            class_id,
            subject_id,
            group_count,
        })
        .collect())
}

pub async fn set_curriculum_entries(
    pool: &SqlitePool,
    entries: Vec<(String, String, String, Option<String>, i64)>,
) -> Result<Vec<ScheduleCurriculum>, DbError> {
    // entries: (class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week)
    let mut out = Vec::new();
    let mut tx = pool.begin().await?;

    // replace all: delete and reinsert (simplest for MVP, keeps UNIQUE)
    sqlx::query("DELETE FROM schedule_curriculum").execute(&mut *tx).await?;

    for (class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week) in entries {
        validation::validate_hours_per_week(hours_per_week).map_err(|e| DbError::Validation(e.to_string()))?;
        validation::validate_split_teachers(&teacher_id, split_teacher2_id.as_deref())
            .map_err(|e| DbError::Validation(e.to_string()))?;

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO schedule_curriculum (id, class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(&id)
        .bind(&class_id)
        .bind(&subject_id)
        .bind(&teacher_id)
        .bind(&split_teacher2_id)
        .bind(hours_per_week)
        .execute(&mut *tx)
        .await?;

        out.push(ScheduleCurriculum {
            id,
            class_id,
            subject_id,
            teacher_id,
            split_teacher2_id,
            hours_per_week,
        });
    }

    tx.commit().await?;
    Ok(out)
}

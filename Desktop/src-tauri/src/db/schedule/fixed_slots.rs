use sqlx::SqlitePool;
use crate::db::DbError;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FixedSlot {
    pub id: String,
    pub variant_id: String,
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub room_id: String,
    pub day: i64,
    pub period: i64,
    pub subgroup_label: Option<String>,
    pub created_at: String,
}

pub async fn insert_fixed_slot(
    pool: &SqlitePool,
    id: &str,
    variant_id: &str,
    class_id: &str,
    subject_id: &str,
    teacher_id: &str,
    room_id: &str,
    day: i64,
    period: i64,
    subgroup_label: Option<&str>,
) -> Result<FixedSlot, DbError> {
    let sub = subgroup_label.unwrap_or("");
    sqlx::query(
        r#"INSERT INTO schedule_fixed_slots (id, variant_id, class_id, subject_id, teacher_id, room_id, day, period, subgroup_label)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
    )
    .bind(id)
    .bind(variant_id)
    .bind(class_id)
    .bind(subject_id)
    .bind(teacher_id)
    .bind(room_id)
    .bind(day)
    .bind(period)
    .bind(sub)
    .execute(pool)
    .await?;

    get_fixed_slot(pool, id).await
}

pub async fn get_fixed_slot(pool: &SqlitePool, id: &str) -> Result<FixedSlot, DbError> {
    let row = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, String, String)>(
        r#"SELECT id, variant_id, class_id, subject_id, teacher_id, room_id, day, period, subgroup_label, created_at
           FROM schedule_fixed_slots WHERE id = ?1"#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| DbError::Internal(format!("fixed slot not found: {id}")))?;

    Ok(FixedSlot {
        id: row.0,
        variant_id: row.1,
        class_id: row.2,
        subject_id: row.3,
        teacher_id: row.4,
        room_id: row.5,
        day: row.6,
        period: row.7,
        subgroup_label: if row.8.is_empty() { None } else { Some(row.8) },
        created_at: row.9,
    })
}

pub async fn list_fixed_slots_for_variant(
    pool: &SqlitePool,
    variant_id: &str,
) -> Result<Vec<FixedSlot>, DbError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, String, String)>(
        r#"SELECT id, variant_id, class_id, subject_id, teacher_id, room_id, day, period, subgroup_label, created_at
           FROM schedule_fixed_slots WHERE variant_id = ?1 ORDER BY day, period"#,
    )
    .bind(variant_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| FixedSlot {
            id: r.0,
            variant_id: r.1,
            class_id: r.2,
            subject_id: r.3,
            teacher_id: r.4,
            room_id: r.5,
            day: r.6,
            period: r.7,
            subgroup_label: if r.8.is_empty() { None } else { Some(r.8) },
            created_at: r.9,
        })
        .collect())
}

pub async fn delete_fixed_slot(pool: &SqlitePool, id: &str) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_fixed_slots WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn clear_fixed_slots(pool: &SqlitePool, variant_id: &str) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schedule_fixed_slots WHERE variant_id = ?1")
        .bind(variant_id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::connect;
    use sqlx::SqlitePool;

    fn avail_all() -> String {
        let m = [[true; 8]; 6];
        serde_json::to_string(&m).unwrap()
    }

    async fn setup_pool() -> SqlitePool {
        let dir = tempfile::tempdir().unwrap();
        connect(&dir.path().join("test.db")).await.unwrap()
    }

    #[tokio::test]
    async fn test_insert_and_list() {
        let pool = setup_pool().await;
        sqlx::query(
            r#"INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number)
               VALUES ('v1', 'Test', '2025-2026', 4, 1)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let slot = super::insert_fixed_slot(
            &pool, "fs1", "v1", "8", "math", "ivanov", "r1", 1, 2, None,
        )
        .await
        .unwrap();
        assert_eq!(slot.class_id, "8");
        assert_eq!(slot.day, 1);

        let all = super::list_fixed_slots_for_variant(&pool, "v1").await.unwrap();
        assert_eq!(all.len(), 1);
    }

    #[tokio::test]
    async fn test_unique_constraint() {
        let pool = setup_pool().await;
        sqlx::query(
            r#"INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number)
               VALUES ('v1', 'Test', '2025-2026', 4, 1)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        super::insert_fixed_slot(&pool, "fs1", "v1", "8", "math", "ivanov", "r1", 1, 2, None)
            .await
            .unwrap();

        let result = super::insert_fixed_slot(
            &pool, "fs2", "v1", "8", "phys", "petrov", "r2", 1, 2, None,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_delete() {
        let pool = setup_pool().await;
        sqlx::query(
            r#"INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number)
               VALUES ('v1', 'Test', '2025-2026', 4, 1)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        super::insert_fixed_slot(&pool, "fs1", "v1", "8", "math", "ivanov", "r1", 1, 2, None)
            .await
            .unwrap();
        super::delete_fixed_slot(&pool, "fs1").await.unwrap();

        let all = super::list_fixed_slots_for_variant(&pool, "v1").await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn test_cascade_delete_variant() {
        let pool = setup_pool().await;
        sqlx::query(
            r#"INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number)
               VALUES ('v1', 'Test', '2025-2026', 4, 1)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        super::insert_fixed_slot(&pool, "fs1", "v1", "8", "math", "ivanov", "r1", 1, 2, None)
            .await
            .unwrap();

        sqlx::query("DELETE FROM schedule_variants WHERE id = 'v1'")
            .execute(&pool)
            .await
            .unwrap();

        let all = super::list_fixed_slots_for_variant(&pool, "v1").await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn test_subgroup_label() {
        let pool = setup_pool().await;
        sqlx::query(
            r#"INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number)
               VALUES ('v1', 'Test', '2025-2026', 4, 1)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let slot = super::insert_fixed_slot(
            &pool, "fs1", "v1", "8", "eng", "smith", "r1", 1, 2, Some("A"),
        )
        .await
        .unwrap();
        assert_eq!(slot.subgroup_label, Some("A".to_string()));
    }
}

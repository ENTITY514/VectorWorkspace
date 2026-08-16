//! Слой доступа к данным: асинхронный `sqlx::SqlitePool`.
//! Репозитории — безжалостные исполнители воли домена.

pub mod error;
pub mod repo;
pub mod repo_tup;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

pub use error::DbError;

/// Открывает (или создаёт) базу и накатывает миграции.
/// WAL и `foreign_keys` включаются на уровне соединения.
pub async fn connect(path: &Path) -> Result<SqlitePool, DbError> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXPECTED_TABLES: &[&str] = &[
        "schools",
        "school_staff",
        "teacher_profiles",
        "classes",
        "tup_documents",
        "learning_objectives",
        "tup_document_tasks",
        "tup_subject_hours",
        "tup_quarters",
        "tup_sections",
        "tup_topics",
        "tup_topic_objectives",
        "ktp_plans",
        "ktp_quarters",
        "ktp_lessons",
        "ktp_lesson_objectives",
        "ksp_documents",
        "sor_specifications",
        "sor_task_templates",
        "sor_descriptors",
        "sor_variants",
        "soch_specifications",
        "soch_section_weights",
        "soch_tasks",
        "soch_marking_steps",
        "textbooks",
        "textbook_paragraphs",
        "textbook_tasks",
        "textbook_task_objectives",
        "textbook_tasks_fts",
    ];

    async fn list_tables(pool: &SqlitePool) -> Vec<String> {
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .fetch_all(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn migrations_apply_from_scratch() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let pool = connect(&db_path).await.unwrap();

        let tables = list_tables(&pool).await;
        for expected in EXPECTED_TABLES {
            assert!(
                tables.iter().any(|t| t == expected),
                "таблица {expected} отсутствует в схеме"
            );
        }

        // PRAGMA-режимы.
        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(journal.to_ascii_lowercase(), "wal");

        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);
    }

    #[tokio::test]
    async fn migrations_are_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let pool = connect(&db_path).await.unwrap();

        // Версия схемы совпадает с максимальной миграцией.
        let version_before: i64 = sqlx::query_scalar(
            "SELECT version FROM _sqlx_migrations ORDER BY version DESC LIMIT 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(version_before, 5);

        // Повторный накат не меняет версию (идемпотентность).
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let version_after: i64 = sqlx::query_scalar(
            "SELECT version FROM _sqlx_migrations ORDER BY version DESC LIMIT 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(version_after, 5);
    }

    #[tokio::test]
    async fn objective_code_is_stored_as_is() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = connect(&db_path).await.unwrap();

        let doc_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO tup_documents (id, order_number, order_date, appendix_number, subject_id, language, target_grades)
             VALUES (?1, '130', '2024-01-01', 1, 'algebra', 'RU', '8')",
        )
        .bind(&doc_id)
        .execute(&pool)
        .await
        .unwrap();

        // 4-частный код.
        let obj_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO learning_objectives (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
             VALUES (?1, ?2, 8, 4, 1, 3, 'Описание цели', '8.4.1.3')",
        )
        .bind(&obj_id)
        .bind(&doc_id)
        .execute(&pool)
        .await
        .unwrap();

        let code: String = sqlx::query_scalar("SELECT code FROM learning_objectives WHERE id = ?1")
            .bind(&obj_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(code, "8.4.1.3");

        // 3-частный код геометрии 10-11 хранится как в источнике.
        let obj_id2 = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO learning_objectives (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
             VALUES (?1, ?2, 10, 1, 1, 1, 'знать определение', '10.1.1')",
        )
        .bind(&obj_id2)
        .bind(&doc_id)
        .execute(&pool)
        .await
        .unwrap();

        let code2: String = sqlx::query_scalar("SELECT code FROM learning_objectives WHERE id = ?1")
            .bind(&obj_id2)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(code2, "10.1.1");
    }

    #[tokio::test]
    async fn foreign_key_restricts_orphan_objectives() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = connect(&db_path).await.unwrap();

        // Вставка цели с несуществующим документом должна провалиться.
        let res = sqlx::query(
            "INSERT INTO learning_objectives (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
             VALUES ('orphan', 'missing-doc', 8, 1, 1, 1, 'x', '8.1.1.1')",
        )
        .execute(&pool)
        .await;

        assert!(res.is_err(), "внешний ключ не сработал");
    }
}

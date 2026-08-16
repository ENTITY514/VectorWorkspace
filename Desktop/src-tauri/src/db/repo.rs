//! Репозитории: безжалостные исполнители воли домена.
//! Каждый репозиторий работает через `sqlx::SqlitePool`.
//! Здесь появляются конкретные репозитории по мере реализации фаз.

use sqlx::SqlitePool;

use crate::db::DbError;

/// Репозиторий реестра схемы (health-check): версия применимой миграции.
pub async fn current_schema_version(pool: &SqlitePool) -> Result<i64, DbError> {
    let version: Option<i64> = sqlx::query_scalar(
        "SELECT version FROM _sqlx_migrations ORDER BY version DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    Ok(version.unwrap_or(0))
}

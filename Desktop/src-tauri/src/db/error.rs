//! Ошибки слоя данных.
//! Все варианты ошибок ещё не задействованы каждым контуром — dead_code ожидаем.
#![allow(dead_code)]

use sqlx::Error as SqlxError;
use std::io;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("sqlx: {0}")]
    Sqlx(#[from] SqlxError),
    #[error("путь базы данных не является файлом: {0}")]
    InvalidPath(String),
    #[error("io: {0}")]
    Io(#[from] io::Error),
    #[error("внутренняя ошибка: {0}")]
    Internal(String),
}

impl From<sqlx::migrate::MigrateError> for DbError {
    fn from(e: sqlx::migrate::MigrateError) -> Self {
        DbError::Sqlx(SqlxError::Migrate(Box::new(e)))
    }
}

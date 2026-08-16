//! Health-команда: проверка целостности ядра при старте.

use serde::Serialize;

use crate::commands::AppState;
use crate::db;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub status: &'static str,
    pub app_version: &'static str,
    pub schema_version: i64,
}

#[tauri::command]
pub async fn health(state: tauri::State<'_, AppState>) -> Result<HealthReport, String> {
    let schema_version = db::repo::current_schema_version(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(HealthReport {
        status: "ok",
        app_version: env!("CARGO_PKG_VERSION"),
        schema_version,
    })
}

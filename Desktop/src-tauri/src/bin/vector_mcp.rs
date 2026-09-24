//! MCP stdio-сервер VectorWorkspace: КТП + КСП в одной живой SQLite.
//!
//! Тот же код и та же база, что у приложения. Отдельного процесса-форка логики нет.
//!
//!   cargo run --bin vector-mcp
//!   cargo run --bin vector-mcp -- --db "%APPDATA%/com.teacher.vectorworkspace/vector.db"
//!
//! Переменная VECTOR_DB перекрывает путь по умолчанию.

use std::path::PathBuf;

use vector_workspace_lib::db;
use vector_workspace_lib::AppState;

fn default_db() -> PathBuf {
    if let Ok(p) = std::env::var("VECTOR_DB") {
        return PathBuf::from(p);
    }
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(base)
        .join("com.teacher.vectorworkspace")
        .join("vector.db")
}

fn parse_db_arg() -> PathBuf {
    let args: Vec<String> = std::env::args().collect();
    args.windows(2)
        .find(|w| w[0] == "--db")
        .map(|w| PathBuf::from(&w[1]))
        .unwrap_or_else(default_db)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = parse_db_arg();
    if !db_path.exists() {
        eprintln!("База не найдена: {}", db_path.display());
        eprintln!("Запустите приложение хотя бы раз или укажите --db / VECTOR_DB.");
        std::process::exit(2);
    }
    let pool = db::connect(&db_path).await?;
    eprintln!("vector-mcp: {}", db_path.display());
    vector_workspace_lib::infra::mcp::stdio::serve(AppState { pool }).await?;
    Ok(())
}

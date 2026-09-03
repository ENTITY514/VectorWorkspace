//! Разрешение путей к ресурсам приложения.
//!
//! Раньше и солвер, и стартовые данные адресовались через
//! `env!("CARGO_MANIFEST_DIR")` — путь дерева исходников сборочной машины,
//! зашитый в бинарник на этапе компиляции. В установленном приложении такого
//! каталога не существует, поэтому генерация и импорт падали у любого
//! пользователя, кроме автора сборки.
//!
//! Порядок поиска: каталог ресурсов бандла, затем — дерево исходников
//! (режим разработки, где бандла нет).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

/// Не удалось найти ресурс ни в бандле, ни в дереве исходников.
#[derive(Debug, thiserror::Error)]
#[error("ресурс «{name}» не найден (искали: {tried})")]
pub struct ResourceError {
    pub name: String,
    pub tried: String,
}

fn first_existing(candidates: &[PathBuf], name: &str) -> Result<PathBuf, ResourceError> {
    for c in candidates {
        if c.exists() {
            return Ok(c.clone());
        }
    }
    Err(ResourceError {
        name: name.to_string(),
        tried: candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join("; "),
    })
}

/// Путь дерева исходников — только для режима разработки.
fn dev_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// Точка входа Python-солвера (`solver/__main__.py`).
pub fn solver_script<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, ResourceError> {
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("solver").join("__main__.py"));
        candidates.push(dir.join("_up_").join("solver").join("__main__.py"));
    }
    candidates.push(dev_root().join("solver").join("__main__.py"));
    first_existing(&candidates, "solver/__main__.py")
}

/// Каталог стартовых данных (демо-школа, legacy-расписания).
///
/// Данные конкретной школы не должны попадать в дистрибутив как молчаливое
/// стартовое состояние — этот путь используется только явными операциями
/// импорта, а не автозагрузкой при пустой базе.
pub fn seed_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, ResourceError> {
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("data").join("synthetic"));
        candidates.push(dir.join("_up_").join("data").join("synthetic"));
    }
    candidates.push(dev_root().join("data").join("synthetic"));
    first_existing(&candidates, "data/synthetic")
}

/// Существует ли путь и является ли он файлом — вынесено ради тестируемости.
pub fn is_readable_file(p: &Path) -> bool {
    p.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_root_points_at_repository_root() {
        // В дереве исходников солвер и данные обязаны находиться.
        let root = dev_root();
        assert!(
            root.join("solver").join("__main__.py").exists(),
            "solver/__main__.py не найден относительно CARGO_MANIFEST_DIR"
        );
    }

    #[test]
    fn first_existing_reports_all_tried_paths() {
        let err = first_existing(
            &[PathBuf::from("/nope/a"), PathBuf::from("/nope/b")],
            "x",
        )
        .unwrap_err();
        assert!(err.tried.contains("a") && err.tried.contains("b"));
    }
}

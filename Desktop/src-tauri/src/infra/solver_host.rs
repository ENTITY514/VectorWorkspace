use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Debug, thiserror::Error)]
pub enum SolverError {
    #[error("неверный контракт: {0}")]
    InvalidContract(String),
    #[error("солвер упал: {0}")]
    Crashed(String),
    #[error("таймаут ожидания солвера")]
    Timeout,
    #[error("io: {0}")]
    Io(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverOutput {
    pub schema_version: i64,
    pub status: String,
    pub solver_stats: serde_json::Value,
    pub penalties: serde_json::Value,
    pub slots: Vec<serde_json::Value>,
    pub diagnostics: serde_json::Value,
}

pub struct SolverHost {
    pub python_bin: String,
    pub solver_script: PathBuf,
}

impl SolverHost {
    pub fn new(python_bin: String, solver_script: PathBuf) -> Self {
        Self { python_bin, solver_script }
    }

    /// Пытается найти python с ortools: сперва полный путь Python312, затем `python`, затем `python3`.
    pub fn default_python() -> String {
        let candidates = [
            r"C:\Users\Sulpak\AppData\Local\Programs\Python\Python312\python.exe",
            r"C:\Program Files\Python312\python.exe",
            "python",
            "python3",
        ];
        for c in candidates {
            if c.contains(':') {
                if std::path::Path::new(c).exists() {
                    return c.to_string();
                }
            } else {
                return c.to_string();
            }
        }
        "python".to_string()
    }

    /// Запускает Python-процесс, передаёт JSON на stdin, читает stdout JSON.
    pub async fn run(&self, input_json: serde_json::Value) -> Result<SolverOutput, SolverError> {
        let json_bytes = serde_json::to_vec(&input_json).map_err(|e| SolverError::InvalidContract(e.to_string()))?;

        let mut child = Command::new(&self.python_bin)
            .arg(&self.solver_script)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| SolverError::Io(e.to_string()))?;

        // запись stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(&json_bytes).await.map_err(|e| SolverError::Io(e.to_string()))?;
            stdin.shutdown().await.map_err(|e| SolverError::Io(e.to_string()))?;
        }

        // ожидание с таймаутом (time_limit + grace)
        let time_limit = input_json.get("meta").and_then(|m| m.get("time_limit_sec")).and_then(|v| v.as_u64()).unwrap_or(60);
        let timeout = Duration::from_secs(time_limit + 10);

        let output = tokio::time::timeout(timeout, child.wait_with_output())
            .await
            .map_err(|_| SolverError::Timeout)?
            .map_err(|e| SolverError::Io(e.to_string()))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            // exit 2 = INVALID_INPUT, иначе Crashed
            if output.status.code() == Some(2) {
                // попробуем распарсить stdout как OutputModel INVALID_INPUT
                if let Ok(val) = serde_json::from_str::<SolverOutput>(&stdout) {
                    return Ok(val);
                }
                return Err(SolverError::InvalidContract(stderr));
            }
            // если stdout всё же содержит JSON (INFEASIBLE тоже может быть exit 0)
            if let Ok(val) = serde_json::from_str::<SolverOutput>(&stdout) {
                return Ok(val);
            }
            return Err(SolverError::Crashed(format!("exit {:?} stderr: {} stdout: {}", output.status.code(), stderr, stdout)));
        }

        let parsed: SolverOutput = serde_json::from_str(&stdout).map_err(|e| SolverError::Crashed(format!("stdout parse failed: {} stderr:{} stdout:{}", e, stderr, stdout)))?;
        if parsed.schema_version != 1 {
            return Err(SolverError::InvalidContract(format!("schema_version mismatch: {}", parsed.schema_version)));
        }
        Ok(parsed)
    }

    #[cfg(test)]
    pub fn test_input_micro() -> serde_json::Value {
        serde_json::json!({
            "schema_version": 1,
            "meta": {"time_limit_sec": 5, "num_workers": 2, "random_seed": 42},
            "time_grid": {"days": 2, "periods_per_day": 3},
            "teachers": [{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": [[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true]]}],
            "classes": [{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
            "rooms": [{"id": "r1", "name": "Kab1", "room_type": "General", "capacity": 30}],
            "subjects": [{"id": "math", "name": "Math", "sanitary_weight": 9}],
            "curriculum": [{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
            "weights": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0}
        })
    }

    /// Валидирует Hard-ограничения на Rust-стороне перед коммитом (Zero-Trust).
    pub fn validate_hard(slots: &[serde_json::Value]) -> Result<(), String> {
        use std::collections::HashSet;
        let mut teacher_slots = HashSet::new();
        let mut class_slots = HashSet::new();
        let mut room_slots = HashSet::new();
        for s in slots {
            let teacher = s.get("teacher_id").and_then(|v| v.as_str()).unwrap_or("");
            let class = s.get("class_id").and_then(|v| v.as_str()).unwrap_or("");
            let room = s.get("room_id").and_then(|v| v.as_str()).unwrap_or("");
            let day = s.get("day").and_then(|v| v.as_i64()).unwrap_or(-1);
            let period = s.get("period").and_then(|v| v.as_i64()).unwrap_or(-1);
            let label = s.get("subgroup_label").and_then(|v| v.as_str()).unwrap_or("");
            let tk = format!("{teacher}:{day}:{period}");
            if !teacher_slots.insert(tk.clone()) {
                return Err(format!("Hard violation: teacher {teacher} duplicate at {day}:{period}"));
            }
            let ck = format!("{class}:{label}:{day}:{period}");
            if !class_slots.insert(ck.clone()) {
                return Err(format!("Hard violation: class {class} duplicate at {day}:{period}"));
            }
            let rk = format!("{room}:{day}:{period}");
            if !room_slots.insert(rk.clone()) {
                return Err(format!("Hard violation: room {room} duplicate at {day}:{period}"));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn solver_host_micro_optimal() {
        let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../solver/__main__.py");
        if !script.exists() {
            // в CI без Python — пропускаем
            return;
        }
        let host = SolverHost::new(SolverHost::default_python(), script);
        let input = SolverHost::test_input_micro();
        let out = host.run(input).await.expect("solver should succeed");
        assert!(out.status == "OPTIMAL" || out.status == "FEASIBLE", "status {:?}", out.status);
        assert!(!out.slots.is_empty());
        SolverHost::validate_hard(&out.slots).expect("hard validation");
    }

    #[tokio::test]
    async fn solver_host_infeasible_diagnostics() {
        let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../solver/__main__.py");
        if !script.exists() {
            return;
        }
        let host = SolverHost::new(SolverHost::default_python(), script);
        let mut input = SolverHost::test_input_micro();
        // сделаем infeasible: 2 часа при 1 слоте
        input["time_grid"] = serde_json::json!({"days": 1, "periods_per_day": 1});
        input["curriculum"] = serde_json::json!([{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 2}]);
        let out = host.run(input).await.expect("should return infeasible, not crash");
        assert_eq!(out.status, "INFEASIBLE");
        assert!(out.diagnostics.get("infeasible_core").is_some());
    }
}

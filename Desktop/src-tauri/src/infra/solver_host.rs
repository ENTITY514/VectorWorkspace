use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tokio::io::AsyncWriteExt;

/// Версия контракта, которую отправляет Rust. Должна совпадать с
/// `SCHEMA_VERSION` в `solver/schema.py` — проверяется контрактным тестом.
pub const SCHEMA_VERSION: i64 = 2;

/// Версии ответа солвера, которые хост умеет разбирать.
pub const SUPPORTED_SCHEMA_VERSIONS: [i64; 2] = [1, 2];

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

    /// Список кандидатов на интерпретатор, в порядке приоритета.
    ///
    /// Личные пути разработчика убраны: они делали сборку неработоспособной
    /// на любой чужой машине. Приоритет отдан явной настройке пользователя.
    fn python_candidates() -> Vec<String> {
        let mut candidates = Vec::new();

        // 1. Явное указание пользователя — всегда важнее любых догадок.
        if let Ok(explicit) = std::env::var("VECTOR_PYTHON") {
            if !explicit.trim().is_empty() {
                candidates.push(explicit);
            }
        }

        // 2. Типовые установки в профиле текущего пользователя.
        if let Ok(profile) = std::env::var("USERPROFILE") {
            for suffix in [
                r"AppData\Local\Python\pythoncore-3.13-64\python.exe",
                r"AppData\Local\Programs\Python\Python313\python.exe",
                r"AppData\Local\Programs\Python\Python312\python.exe",
                r"AppData\Local\Programs\Python\Python311\python.exe",
            ] {
                candidates.push(format!(r"{profile}\{suffix}"));
            }
        }

        // 3. Общесистемные установки.
        candidates.extend([
            r"C:\Program Files\Python313\python.exe".to_string(),
            r"C:\Program Files\Python312\python.exe".to_string(),
            r"C:\Program Files\Python311\python.exe".to_string(),
        ]);

        // 4. PATH — последняя надежда.
        candidates.extend(["python3".to_string(), "python".to_string()]);
        candidates
    }

    /// Проверяет, что интерпретатор существует И умеет импортировать ortools.
    ///
    /// Проверка по факту запуска, а не по существованию файла: python без
    /// ortools бесполезен, а прежний код возвращал первый же `python` из PATH
    /// вообще без проверок — ветка без `:` в пути выходила из цикла сразу.
    fn probe_python(bin: &str) -> bool {
        std::process::Command::new(bin)
            .args(["-c", "import ortools.sat.python.cp_model"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Находит рабочий интерпретатор Python с установленным ortools.
    ///
    /// Результат кэшируется: проба запускает процесс, а генерация может
    /// вызываться часто.
    pub fn default_python() -> String {
        use std::sync::OnceLock;
        static CACHED: OnceLock<String> = OnceLock::new();
        CACHED
            .get_or_init(|| {
                Self::python_candidates()
                    .into_iter()
                    .find(|c| Self::probe_python(c))
                    // Ничего не найдено: возвращаем «python», чтобы ошибка
                    // пришла от запуска с внятным stderr, а не от пустой строки.
                    .unwrap_or_else(|| "python".to_string())
            })
            .clone()
    }

    /// Есть ли на машине пригодный интерпретатор. Для экрана диагностики.
    pub fn python_is_available() -> bool {
        Self::probe_python(&Self::default_python())
    }

    /// Запускает Python-процесс, передаёт JSON на stdin, читает stdout JSON.
    pub async fn run(&self, input_json: serde_json::Value) -> Result<SolverOutput, SolverError> {
        let json_bytes = serde_json::to_vec(&input_json).map_err(|e| SolverError::InvalidContract(e.to_string()))?;

        let mut child = Command::new(&self.python_bin)
            .arg(&self.solver_script)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            // Без этого при таймауте дочерний процесс продолжал жить: CP-SAT
            // с num_workers=8 занимал все ядра, а повторные запуски генерации
            // накапливали процессы до перезагрузки машины.
            .kill_on_drop(true)
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

        let output = match tokio::time::timeout(timeout, child.wait_with_output()).await {
            Ok(res) => res.map_err(|e| SolverError::Io(e.to_string()))?,
            Err(_) => {
                // `child` уже поглощён wait_with_output; процесс снимет
                // kill_on_drop при развёртывании стека.
                return Err(SolverError::Timeout);
            }
        };

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
        if !SUPPORTED_SCHEMA_VERSIONS.contains(&parsed.schema_version) {
            return Err(SolverError::InvalidContract(format!(
                "schema_version {} не поддерживается (ожидается одна из {:?})",
                parsed.schema_version, SUPPORTED_SCHEMA_VERSIONS
            )));
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
    ///
    /// Совмещённые уроки (класс-комплекты, инклюзия, ЛУО) — законное исключение:
    /// один учитель в одном кабинете ведёт несколько классов одновременно.
    /// Такой дубликат допустим ТОЛЬКО при совпадающем непустом `joint_lesson_id`
    /// — ровно тот инвариант, который миграция 0019 сняла с уровня БД.
    /// Класс не может находиться в двух местах ни при каких условиях.
    pub fn validate_hard(slots: &[serde_json::Value]) -> Result<(), String> {
        use std::collections::{HashMap, HashSet};

        // (teacher|room, day, period) -> joint_lesson_id первого занявшего слот
        let mut teacher_slots: HashMap<String, Option<String>> = HashMap::new();
        let mut room_slots: HashMap<String, Option<String>> = HashMap::new();
        let mut class_slots: HashSet<String> = HashSet::new();

        for s in slots {
            let teacher = s.get("teacher_id").and_then(|v| v.as_str()).unwrap_or("");
            let class = s.get("class_id").and_then(|v| v.as_str()).unwrap_or("");
            let room = s.get("room_id").and_then(|v| v.as_str()).unwrap_or("");
            let day = s.get("day").and_then(|v| v.as_i64()).unwrap_or(-1);
            let period = s.get("period").and_then(|v| v.as_i64()).unwrap_or(-1);
            let label = s.get("subgroup_label").and_then(|v| v.as_str()).unwrap_or("");
            let joint = s
                .get("joint_lesson_id")
                .and_then(|v| v.as_str())
                .filter(|j| !j.trim().is_empty())
                .map(|j| j.to_string());

            // Класс: дубликат недопустим всегда (подгруппы различаются меткой).
            let ck = format!("{class}\u{1}{label}\u{1}{day}\u{1}{period}");
            if !class_slots.insert(ck) {
                return Err(format!(
                    "Hard violation: класс {class} занят дважды в {day}:{period}"
                ));
            }

            // Учитель: дубликат допустим только внутри одной joint-группы.
            let tk = format!("{teacher}\u{1}{day}\u{1}{period}");
            match teacher_slots.get(&tk) {
                Some(existing) if *existing == joint && joint.is_some() => {}
                Some(_) => {
                    return Err(format!(
                        "Hard violation: учитель {teacher} занят дважды в {day}:{period} \
                         (совмещённый урок не подтверждён общим joint_lesson_id)"
                    ));
                }
                None => {
                    teacher_slots.insert(tk, joint.clone());
                }
            }

            // Урок без кабинета (надомное обучение) помещение не занимает
            // и в проверке накладок не участвует.
            if room.trim().is_empty() {
                continue;
            }

            // Кабинет: то же правило.
            let rk = format!("{room}\u{1}{day}\u{1}{period}");
            match room_slots.get(&rk) {
                Some(existing) if *existing == joint && joint.is_some() => {}
                Some(_) => {
                    return Err(format!(
                        "Hard violation: кабинет {room} занят дважды в {day}:{period} \
                         (совмещённый урок не подтверждён общим joint_lesson_id)"
                    ));
                }
                None => {
                    room_slots.insert(rk, joint.clone());
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slot(class: &str, teacher: &str, room: &str, d: i64, p: i64, joint: Option<&str>) -> serde_json::Value {
        serde_json::json!({
            "class_id": class, "subject_id": "s", "teacher_id": teacher, "room_id": room,
            "subgroup_label": null, "day": d, "period": p, "joint_lesson_id": joint
        })
    }

    #[test]
    fn validate_hard_accepts_joint_lesson() {
        // Класс-комплект: один учитель, один кабинет, два класса, общий joint_lesson_id.
        let slots = vec![
            slot("7b", "t1", "r1", 0, 2, Some("jl_math")),
            slot("7b_luo", "t1", "r1", 0, 2, Some("jl_math")),
        ];
        SolverHost::validate_hard(&slots).expect("совмещённый урок должен приниматься");
    }

    #[test]
    fn validate_hard_rejects_teacher_overlap_without_joint() {
        let slots = vec![
            slot("7b", "t1", "r1", 0, 2, None),
            slot("8a", "t1", "r2", 0, 2, None),
        ];
        let err = SolverHost::validate_hard(&slots).expect_err("накладка учителя должна отвергаться");
        assert!(err.contains("учитель"), "{err}");
    }

    #[test]
    fn validate_hard_rejects_teacher_overlap_with_different_joint() {
        let slots = vec![
            slot("7b", "t1", "r1", 0, 2, Some("jl_a")),
            slot("8a", "t1", "r1", 0, 2, Some("jl_b")),
        ];
        assert!(SolverHost::validate_hard(&slots).is_err(), "разные joint-группы — накладка");
    }

    #[test]
    fn validate_hard_rejects_class_duplicate_even_when_joint() {
        // Класс не может быть в двух местах даже внутри joint-группы.
        let slots = vec![
            slot("7b", "t1", "r1", 0, 2, Some("jl_a")),
            slot("7b", "t2", "r2", 0, 2, Some("jl_a")),
        ];
        assert!(SolverHost::validate_hard(&slots).is_err(), "дубликат класса недопустим");
    }

    #[test]
    fn validate_hard_allows_subgroups_in_same_slot() {
        let mut a = slot("7b", "t1", "r1", 0, 2, None);
        let mut b = slot("7b", "t2", "r2", 0, 2, None);
        a["subgroup_label"] = serde_json::json!("1гр");
        b["subgroup_label"] = serde_json::json!("2гр");
        SolverHost::validate_hard(&[a, b]).expect("подгруппы идут параллельно");
    }

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

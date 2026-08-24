# 04. Архитектура и Интеграция — Tauri (Rust) + React + Python (OR-Tools)

## 4.1 Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│  React (TypeScript) — вкладка «Расписание» (изолированная)      │
│  domains/schedule/                                              │
│  ├─ SchedulePage.tsx (роутер вкладки)                           │
│  ├─ Dashboard, DataManagement, Weights, Grid                    │
│  └─ services/scheduleApi.ts (invoke → Rust)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Tauri invoke (JSON)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Rust Host (Tauri v2, tokio)                                    │
│  src/domain/schedule/  — доменные типы, валидация               │
│  src/db/schedule/      — репозитории (sqlx, SQLite WAL)         │
│  src/commands/schedule.rs — Tauri-команды                       │
│  src/infra/solver_host.rs — управление Python-процессом         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ stdin (JSON) / stdout (JSON) / stderr (логи)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Python Solver (изолированный процесс)                          │
│  solver/engine.py — CP-SAT модель (OR-Tools)                    │
│  solver/schema.py — pydantic InputModel/OutputModel             │
│  solver/__main__.py — читает stdin, пишет stdout                │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │  SQLite WAL (только Rust пишет)
         │
┌────────┴────────────────────────────────────────────────────────┐
│  SQLite (Desktop/src-tauri/migrations/0010_schedule.sql)        │
│  schedule_teachers/rooms/classes/curriculum/weights/slots       │
└─────────────────────────────────────────────────────────────────┘
```

### Почему именно так (а не `ortools` crate в Rust)

- `ortools` crate требует сборки C++ OR-Tools (сложно на Windows, долгий CI).
- Python `ortools` — официальный, обновляется первым, имеет `CpSolver` с `log_search_progress`.
- Изоляция: падение Python не роняет Tauri; можно перезапустить, показать `INFEASIBLE`.
- Лёгкая замена: завтра можно подменить Python на Go/Java без изменения Rust-контракта (только JSON).

## 4.2 Rust-слой (Host)

### 4.2.1 Структура модулей

```
Desktop/src-tauri/src/
├── domain/schedule/
│   ├── mod.rs
│   ├── model.rs       // структуры из §02 (Teacher, Class, Room...)
│   ├── validation.rs  // Code-Enforced invariants
│   └── weights.rs
├── db/schedule/
│   ├── mod.rs
│   ├── teachers.rs    // CRUD + availability_json
│   ├── rooms.rs
│   ├── classes.rs
│   ├── curriculum.rs
│   ├── weights.rs
│   └── slots.rs       // запись результата
├── infra/
│   └── solver_host.rs // SolverHost
└── commands/
    └── schedule.rs    // Tauri invoke handlers
```

### 4.2.2 Tauri-команды (invoke)

```rust
#[tauri::command]
async fn schedule_get_state(state: State<'_, AppState>) -> Result<ScheduleState, String>

#[tauri::command]
async fn schedule_upsert_teacher(state: State<'_, AppState>, input: UpsertTeacherInput) -> Result<Teacher, String>

#[tauri::command]
async fn schedule_upsert_room(...) -> Result<Room, String>

#[tauri::command]
async fn schedule_upsert_class(...) -> Result<ClassGroup, String>

#[tauri::command]
async fn schedule_upsert_subject(...) -> Result<Subject, String>

#[tauri::command]
async fn schedule_set_curriculum(state: State<'_, AppState>, entries: Vec<CurriculumEntry>) -> Result<(), String>

#[tauri::command]
async fn schedule_set_weights(state: State<'_, AppState>, weights: Weights) -> Result<Weights, String>

#[tauri::command]
async fn schedule_generate(
    state: State<'_, AppState>,
    time_limit_sec: Option<u64>,
    seed: Option<u64>,
) -> Result<GenerateProgress, String>
// Запускает solver_host::run, стримит прогресс через Tauri Event

#[tauri::command]
async fn schedule_get_slots(state: State<'_, AppState>, filter: SlotFilter) -> Result<Vec<ScheduleSlot>, String>

#[tauri::command]
async fn schedule_export(state: State<'_, AppState>, format: ExportFormat) -> Result<String, String>
// XLSX/CSV для Күнделік
```

### 4.2.3 SolverHost (infra/solver_host.rs)

```rust
pub struct SolverHost {
    python_bin: PathBuf,      // из config или `python` в PATH; для продакшена — embed
    solver_script: PathBuf,   // `solver/engine.py` рядом с бинарём Tauri
}

impl SolverHost {
    pub async fn run(&self, input: ScheduleInput) -> Result<ScheduleOutput, SolverError> {
        // 1. Валидация input (schemars)
        input.validate()?; 
        // 2. Сериализация в JSON
        let json = serde_json::to_vec(&input)?;
        // 3. Spawn
        let mut child = tokio::process::Command::new(&self.python_bin)
            .arg(&self.solver_script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        // 4. Запись stdin + ожидание с таймаутом
        // 5. Чтение stdout → serde_json::from_slice
        // 6. При INFEASIBLE — парсим diagnostics.infeasible_core
        // 7. При TIME_LIMIT — возвращаем best FEASIBLE
    }
}
```

Требования:
- `tokio::process` — не блокирует UI (Non-Blocking Actor Core).
- Таймаут: `time_limit_sec` из JSON + 5 сек grace для завершения Python.
- Логи `stderr` → `tracing::warn!` + Tauri event `schedule:log` для Dashboard.
- При `exit_code !=0` и не-INFEASIBLE → `Err(SolverCrashed(stderr))` → показать пользователю.

Альтернатива IPC: для больших школ (> 200KB JSON) можно использовать временный файл (`TempDir`) + путь в аргументе, но MVP — stdin/stdout достаточно (лимит ~ 10MB).

### 4.2.4 Транзакция результата

```rust
async fn commit_slots(pool: &SqlitePool, output: ScheduleOutput) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM schedule_slots").execute(&mut *tx).await?;
    for slot in output.slots {
        sqlx::query("INSERT INTO schedule_slots (...) VALUES (...)")
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;
}
```

Только после успешной валидации `validate_hard(output)` на Rust-стороне (двойная проверка, Zero-Trust).

## 4.3 Python-слой (Solver Engine)

### 4.3.1 Структура

```
solver/
├── __main__.py      // if __name__ == "__main__": main()
├── engine.py        // build_model(), solve()
├── schema.py        // pydantic InputModel, OutputModel
├── constraints/
│   ├── hard.py      // add_hard_constraints(model, x, y, m)
│   └── soft.py      // add_soft_constraints(...)
└── requirements.txt // ortools==9.10.4067, pydantic==2.7.*
```

### 4.3.2 __main__.py (протокол)

```python
import sys, json
from schema import InputModel, OutputModel
from engine import solve

def main():
    raw = sys.stdin.read()
    try:
        inp = InputModel.model_validate_json(raw)
    except Exception as e:
        sys.stderr.write(f"INVALID_INPUT: {e}")
        sys.exit(2)
    out = solve(inp)  # dict
    # Валидация выхода
    OutputModel.model_validate(out)
    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
```

- Никаких `print` в stdout кроме JSON — иначе Rust не распарсит.
- Все логи → `sys.stderr`.

### 4.3.3 Зависимости и поставка

- **Dev**: `pip install -r solver/requirements.txt` (локальный Python).
- **Prod**: два варианта:
  1. **Embed**: `python-embed` (Windows) рядом с Tauri binary (`solver/` + `python310.dll`).
  2. **System Python**: Tauri проверяет `python --version` и `pip show ortools`; если нет — предлагает установить (диалог).
- Версия OR-Tools фиксируется (`==9.10.*`) чтобы избежать регрессий.

## 4.4 Жизненный цикл генерации (последовательность)

```
1. Пользователь: настраивает справочники → жмёт "Сгенерировать" в Dashboard.
2. React: invoke("schedule_generate", {time_limit_sec: 60})
3. Rust: собирает ScheduleInput из SQLite (5 таблиц → JSON), валидирует, спавнит Python.
4. Rust: эмитит событие `schedule:progress` ("Сборка модели...", "Поиск...", "42%").
   - Python пишет прогресс в stderr (парсится по префиксу `PROGRESS:`).
5. Python: строит CpModel (0.5 сек), запускает Solve (до 60 сек), возвращает JSON.
6. Rust: читает stdout, валидирует OutputModel, проверяет Hard (0 нарушений), коммитит в schedule_slots.
7. Rust: эмитит `schedule:done` → React перезапрашивает `schedule_get_slots` и рендерит грид.
8. При INFEASIBLE: Rust не коммитит, возвращает `diagnostics.infeasible_core` → Dashboard показывает карточку конфликта.
```

## 4.5 Безопасность и изоляция

- **Вкладка «Расписание»** — отдельный React-роутер (`/schedule/*`), не импортирует `tup/*`, `ktp/*`. Линт: `no-restricted-imports` для `domains/tup`.
- **БД**: `schedule_*` таблицы — отдельный префикс, миграции версионированы, не трогают `tup_*`, `ktp_*`.
- **Файловая система**: Python имеет доступ только к stdin/stdout, не к SQLite файлу.
- **Ресурсы**: `num_search_workers=8` ограничивается `min(8, num_cpus)` чтобы не подвесить UI.

## 4.6 Конфигурация и расширяемость

- `Weights` — singleton в SQLite, редактируется ползунками; изменение не требует пересборки модели (только objective).
- `time_grid` (дни/периоды) — настраивается на школу (5/6-дневка, 6/7/8 уроков).
- Добавление нового Soft: 1) добавить поле в `Weights`, 2) индикатор в `soft.py`, 3) ползунок в UI — Hard не затрагивается.

## 4.7 Альтернативы (отклонённые)

| Альтернатива | Почему отклонена |
|--------------|-----------------|
| `ortools` crate в Rust | Сложность сборки C++ на Windows, отставание от Python-релизов |
| gRPC / WebSocket вместо stdin/stdout | Оверхед для локального процесса; усложняет жизненный цикл |
| Встраивание Python через `pyo3` | Блокирует Tauri поток, сложнее деплой, нет изоляции падения |

## 4.8 Чек-лист готовности архитектуры

- [ ] `solver_host.rs` покрыт тестами на mock-JSON (успех, INFEASIBLE, crash, таймаут).
- [ ] `schedule_slots` валидируется Rust перед коммитом (двойная проверка).
- [ ] Python `requirements.txt` зафиксирован, CI ставит `ortools`.
- [ ] События `schedule:progress` доходят до React без блокировки.

# 10. Архитектурная спецификация Rust: база знаний и MCP

Код-референс ядра Vector на Rust. Типы — новотипизированные идентификаторы; MCP-инструменты реализуют трейт `McpTool` с автогенерацией схем через `schemars`.

```rust
use async_trait::async_trait;
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ========================================================
// 1. ИДЕНТИФИКАТОРЫ И ТИПЫ БАЗЫ ЗНАНИЙ УЧЕБНИКОВ
// ========================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct BookId(pub Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ParagraphId(pub Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct TaskUnitId(pub Uuid);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum TaskDifficulty {
    LevelA, // Базовый уровень
    LevelB, // Средний уровень
    LevelC, // Продвинутый уровень / олимпиадный
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskUnit {
    pub id: TaskUnitId,
    pub paragraph_id: ParagraphId,
    pub exercise_number_display: String, // "№ 124(a)"
    pub raw_latex_condition: String,     // Условие задачи с формулами в LaTeX
    pub difficulty: TaskDifficulty,
    pub linked_objective_codes: Vec<String>, // ["7.1.2.5"]
    pub answer_latex: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookParagraph {
    pub id: ParagraphId,
    pub book_id: BookId,
    pub paragraph_number: u8,
    pub title: String,
    pub compressed_theory_markdown: String,
    pub linked_objective_codes: Vec<String>,
}

// ========================================================
// 2. СХЕМЫ MCP-ИНСТРУМЕНТОВ РАБОТЫ С УЧЕБНИКАМИ
// ========================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FetchTheoryParams {
    pub subject_id: Uuid,
    pub grade: u8,
    pub objective_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FetchExercisesParams {
    pub subject_id: Uuid,
    pub objective_code: String,
    pub difficulty: Option<TaskDifficulty>,
    pub limit: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetExerciseByNumberParams {
    pub book_id: Uuid,
    pub paragraph_number: u8,
    pub exercise_number: String,
}

// ========================================================
// 3. РЕАЛИЗАЦИЯ MCP-ИНСТРУМЕНТА ВЫБОРКИ ЗАДАЧ
// ========================================================

pub struct FetchExercisesTool {
    db_pool: sqlx::SqlitePool,
}

impl FetchExercisesTool {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { db_pool: pool }
    }
}

#[async_trait]
impl crate::McpTool for FetchExercisesTool {
    fn name(&self) -> &'static str {
        "fetch_textbook_exercises"
    }

    fn description(&self) -> &'static str {
        "Выборка верифицированных задач из утвержденного учебника в формате LaTeX по коду цели ТУП."
    }

    fn input_schema(&self) -> serde_json::Value {
        let schema = schema_for!(FetchExercisesParams);
        serde_json::to_value(schema).expect("Сбой генерации схемы schemars")
    }

    async fn execute(&self, raw_params: serde_json::Value) -> Result<serde_json::Value, crate::ToolExecutionError> {
        let params: FetchExercisesParams = serde_json::from_value(raw_params)
            .map_err(|e| crate::ToolExecutionError::InvalidSyntax(e.to_string()))?;

        let diff_str = params.difficulty.map(|d| match d {
            TaskDifficulty::LevelA => "LevelA",
            TaskDifficulty::LevelB => "LevelB",
            TaskDifficulty::LevelC => "LevelC",
        });

        let rows = sqlx::query!(
            r#"
            SELECT t.id, t.exercise_number_display, t.raw_latex_condition, t.difficulty
            FROM textbook_tasks t
            JOIN textbook_task_objectives o ON t.id = o.task_id
            WHERE o.objective_code = $1
              AND ($2 IS NULL OR t.difficulty = $2)
            LIMIT $3
            "#,
            params.objective_code,
            diff_str,
            params.limit
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| crate::ToolExecutionError::InternalFailure(e.to_string()))?;

        let tasks: Vec<serde_json::Value> = rows
            .into_iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.id,
                    "number": r.exercise_number_display,
                    "condition_latex": r.raw_latex_condition,
                    "difficulty": r.difficulty
                })
            })
            .collect();

        Ok(serde_json::json!({
            "objective_code": params.objective_code,
            "found_count": tasks.len(),
            "tasks": tasks
        }))
    }
}
```

## Ключевые решения
- **Newtype-идентификаторы** (`BookId`, `ParagraphId`, `TaskUnitId`) — компилятор исключает смешение типов.
- **`JsonSchema`** на всех структурах параметров → автогенерация JSON Schema для MCP Tool Registry.
- **async `sqlx::SqlitePool`** — неблокирующий доступ к БД (Non-Blocking Actor Core на tokio).
- **Один источник** — запрос JOIN `textbook_tasks` × `textbook_task_objectives` по коду цели с фильтром сложности и LIMIT.
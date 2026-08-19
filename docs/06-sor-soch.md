# 06. Методический контур: СОР и СОЧ (Суммативное оценивание)

## Обзор

Два уровня суммативного оценивания: СОР (за раздел) и СОЧ (за четверть). Оба контура подчинены строгим инвариантам баллов.

## Требования

### FR-4.1. Изоморфизм вариантов СОР
Варианты 1..N:
- идентичны по **числу заданий**;
- идентичны по **проверяемым целям** `ObjectiveId`;
- идентичны по **номиналу баллов дескрипторов**;
- варьируются только **числовые коэффициенты** при сохранении условий разрешимости (например, `D >= 0` для квадратного уравнения).

### FR-4.2. Диагностическая матрица СОР
Фиксация баллов по каждому дескриптору (0/1) с расчётом процента усвоения целей:

```
Achievement(Objective) = Σ ScoredPoints / Σ MaxPossiblePoints × 100%
```

### FR-4.3. Двойной баланс СОЧ
1. **Сумма баллов всех заданий** равна итоговому баллу работы (например, 20).
2. **Сумма баллов задач каждого раздела** точно равна весу этого раздела:

```
Σ MaxScore(t) = AllocatedPoints(Section_K)   (t ∈ Section_K)
```

### FR-4.4. Marking Scheme
Пошаговая схема оценивания для заданий РО (развернутый ответ):
- подшаги (`subtask_label`, `expected_answer`, `points`);
- критерии **альтернативных решений** в `additional_info`.

## Схема данных

```sql
-- СОР
CREATE TABLE sor_specifications (
    id TEXT PRIMARY KEY,
    section_name TEXT NOT NULL,
    grade INTEGER NOT NULL,
    time_limit_minutes INTEGER NOT NULL DEFAULT 25,
    thinking_level TEXT NOT NULL,
    total_score INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE sor_task_templates (
    id TEXT PRIMARY KEY,
    sor_spec_id TEXT NOT NULL REFERENCES sor_specifications(id) ON DELETE CASCADE,
    task_number INTEGER NOT NULL,
    criteria_title TEXT NOT NULL,
    max_score INTEGER NOT NULL CHECK (max_score > 0),
    UNIQUE (sor_spec_id, task_number)
);

CREATE TABLE sor_descriptors (
    id TEXT PRIMARY KEY,
    task_template_id TEXT NOT NULL REFERENCES sor_task_templates(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    description TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 1,
    UNIQUE (task_template_id, step_order)
);

CREATE TABLE sor_variants (
    id TEXT PRIMARY KEY,
    sor_spec_id TEXT NOT NULL REFERENCES sor_specifications(id) ON DELETE CASCADE,
    variant_number INTEGER NOT NULL,
    tasks_content TEXT NOT NULL,           -- JSONB: изоморфная замена коэффициентов
    UNIQUE (sor_spec_id, variant_number)
);

-- СОЧ
CREATE TABLE soch_specifications (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
    duration_minutes INTEGER NOT NULL DEFAULT 45,
    total_score INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (subject_id, grade, quarter_number)
);

CREATE TABLE soch_section_weights (
    soch_spec_id TEXT NOT NULL REFERENCES soch_specifications(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL,
    allocated_points INTEGER NOT NULL,
    PRIMARY KEY (soch_spec_id, section_id)
);

CREATE TABLE soch_tasks (
    id TEXT PRIMARY KEY,
    soch_spec_id TEXT NOT NULL REFERENCES soch_specifications(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL,
    task_number INTEGER NOT NULL,
    answer_type TEXT NOT NULL CHECK (answer_type IN ('Short', 'Detailed')),
    thinking_level TEXT NOT NULL,
    estimated_time_minutes INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    UNIQUE (soch_spec_id, task_number)
);

CREATE TABLE soch_marking_steps (
    id TEXT PRIMARY KEY,
    soch_task_id TEXT NOT NULL REFERENCES soch_tasks(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    subtask_label TEXT NULL,
    expected_answer TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 1,
    additional_info TEXT NULL,             -- критерии альтернативных решений
    UNIQUE (soch_task_id, step_order)
);
```

## Где реализуются инварианты
- **FR-4.1** — генератор вариантов: одна каноническая структура + подстановка коэффициентов.
- **FR-4.2** — модуль диагностики: матрица «класс × дескрипторы», `Achievement(Objective)`.
- **FR-4.3** — валидатор двойного баланса в InvariantGuillotine при сохранении СОЧ.
- **FR-4.4** — `soch_marking_steps` с `additional_info` для альтернативных решений РО.
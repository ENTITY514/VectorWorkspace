# 09. Полная реляционная схема базы данных (SQLite Production DDL)

Единая схема локальной БД (WAL-режим). Структура соответствует мастер-спецификации v1.1.

```sql
-- Включение режима защиты данных и внешних ключей
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ========================================================
-- 1. НОРМАТИВНЫЙ БАЗИС (ТУП)
-- ========================================================
CREATE TABLE tup_documents (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    order_date TEXT NOT NULL,
    appendix_number INTEGER NOT NULL,
    subject_id TEXT NOT NULL,
    language TEXT NOT NULL,
    target_grades TEXT NOT NULL
);

CREATE TABLE learning_objectives (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    section_number INTEGER NOT NULL,
    subsection_number INTEGER NOT NULL,
    objective_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    code TEXT GENERATED ALWAYS AS (
        grade || '.' || section_number || '.' || subsection_number || '.' || objective_number
    ) STORED
);

CREATE INDEX idx_objectives_code ON learning_objectives (code);
CREATE INDEX idx_objectives_grade ON learning_objectives (document_id, grade);

-- ========================================================
-- 2. КАЛЕНДАРНО-ТЕМАТИЧЕСКИЙ ПЛАН (КТП)
-- ========================================================
CREATE TABLE ktp_plans (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    academic_year TEXT NOT NULL,
    total_hours INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Validating', 'Approved', 'Archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE ktp_quarters (
    id TEXT PRIMARY KEY,
    ktp_id TEXT NOT NULL REFERENCES ktp_plans(id) ON DELETE CASCADE,
    quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
    hours_per_week INTEGER NOT NULL CHECK (hours_per_week > 0),
    UNIQUE (ktp_id, quarter_number)
);

CREATE TABLE ktp_lessons (
    id TEXT PRIMARY KEY,
    quarter_id TEXT NOT NULL REFERENCES ktp_quarters(id) ON DELETE CASCADE,
    global_index INTEGER NOT NULL,
    quarter_index INTEGER NOT NULL,
    topic_title TEXT NOT NULL,
    lesson_type TEXT NOT NULL
        CHECK (lesson_type IN ('Standard', 'Sor', 'Soch', 'Revision')),
    planned_date TEXT NULL,
    is_cancelled INTEGER NOT NULL DEFAULT 0,
    UNIQUE (quarter_id, quarter_index)
);

CREATE TABLE ktp_lesson_objectives (
    lesson_id TEXT NOT NULL REFERENCES ktp_lessons(id) ON DELETE CASCADE,
    objective_id TEXT NOT NULL REFERENCES learning_objectives(id) ON DELETE RESTRICT,
    PRIMARY KEY (lesson_id, objective_id)
);

-- ========================================================
-- 3. ПОУРОЧНЫЕ ПЛАНЫ (КСП) - ПРИКАЗ № 130
-- ========================================================
CREATE TABLE ksp_documents (
    id TEXT PRIMARY KEY,
    ktp_lesson_id TEXT NOT NULL UNIQUE REFERENCES ktp_lessons(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,           -- JSONB-структура KspContent
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- ========================================================
-- 4. СУММАТИВНОЕ ОЦЕНИВАНИЕ (СОР И СОЧ)
-- ========================================================
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
    tasks_content TEXT NOT NULL,
    UNIQUE (sor_spec_id, variant_number)
);

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
    additional_info TEXT NULL,
    UNIQUE (soch_task_id, step_order)
);

-- ========================================================
-- 5. БАЗА ЗНАНИЙ И ОЦИФРОВАННЫЕ УЧЕБНИКИ
-- ========================================================
CREATE TABLE textbooks (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    publisher TEXT NOT NULL,
    publish_year INTEGER NOT NULL,
    is_official_curriculum INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE textbook_paragraphs (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    paragraph_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    theory_markdown TEXT NOT NULL,
    UNIQUE (book_id, paragraph_number)
);

CREATE TABLE textbook_tasks (
    id TEXT PRIMARY KEY,
    paragraph_id TEXT NOT NULL REFERENCES textbook_paragraphs(id) ON DELETE CASCADE,
    exercise_number_display TEXT NOT NULL, -- "№ 125(б)"
    raw_latex_condition TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('LevelA', 'LevelB', 'LevelC')),
    answer_latex TEXT NULL
);

CREATE TABLE textbook_task_objectives (
    task_id TEXT NOT NULL REFERENCES textbook_tasks(id) ON DELETE CASCADE,
    objective_code TEXT NOT NULL,
    PRIMARY KEY (task_id, objective_code)
);

-- Виртуальная таблица полнотекстового поиска FTS5
CREATE VIRTUAL TABLE textbook_tasks_fts USING fts5(
    exercise_number_display,
    raw_latex_condition,
    content='textbook_tasks',
    content_rowid='rowid'
);

-- Триггеры синхронизации FTS5-индекса
CREATE TRIGGER tbl_tasks_ai AFTER INSERT ON textbook_tasks BEGIN
  INSERT INTO textbook_tasks_fts(rowid, exercise_number_display, raw_latex_condition)
  VALUES (new.rowid, new.exercise_number_display, new.raw_latex_condition);
END;

CREATE TRIGGER tbl_tasks_ad AFTER DELETE ON textbook_tasks BEGIN
  INSERT INTO textbook_tasks_fts(textbook_tasks_fts, rowid, exercise_number_display, raw_latex_condition)
  VALUES('delete', old.rowid, old.exercise_number_display, old.raw_latex_condition);
END;
```

## Примечания к схеме
- **WAL** и **foreign_keys** включены на уровне соединения (PRAGMA).
- Код цели — вычисляемый столбец (нельзя записать неконсистентный код).
- FTS5 — content-таблица `textbook_tasks` с триггерами на INSERT/DELETE (обновление через DELETE+INSERT).
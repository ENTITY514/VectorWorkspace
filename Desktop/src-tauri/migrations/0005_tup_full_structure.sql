-- 0005: Полноструктурный реляционный монолит ТУП.
-- Глава 1 (цель и задачи), Параграф 1 (учебная нагрузка),
-- Параграф 3 (Долгосрочный план: четверти -> разделы -> темы -> коды целей).

-- Метаданные документа (Глава 1).
ALTER TABLE tup_documents ADD COLUMN legal_basis TEXT NOT NULL DEFAULT '';
ALTER TABLE tup_documents ADD COLUMN goal_text TEXT NOT NULL DEFAULT '';

-- Задачи предмета (Глава 1, п. 3 «Задачи:»).
CREATE TABLE tup_document_tasks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    task_text TEXT NOT NULL
);

-- Учебная нагрузка по классам (Глава 2, Параграф 1).
CREATE TABLE tup_subject_hours (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    hours_per_week REAL NOT NULL,
    hours_per_year INTEGER NOT NULL,
    UNIQUE (document_id, grade)
);

-- Иерархия Долгосрочного плана (Глава 2, Параграф 3).
CREATE TABLE tup_quarters (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
    UNIQUE (document_id, grade, quarter_number)
);

CREATE TABLE tup_sections (
    id TEXT PRIMARY KEY,
    quarter_id TEXT NOT NULL REFERENCES tup_quarters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER NOT NULL
);

CREATE TABLE tup_topics (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES tup_sections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER NOT NULL
);

-- Связь темы ДСП и цели обучения (N:M).
-- Код хранится строкой, как в источнике: в ДСП код цели может не
-- совпадать 1:1 с кодом в матрице целей (Параграф 2), поэтому жёсткий
-- внешний ключ на learning_objectives запрещён — сверка выполняется кодом.
CREATE TABLE tup_topic_objectives (
    topic_id TEXT NOT NULL REFERENCES tup_topics(id) ON DELETE CASCADE,
    objective_code TEXT NOT NULL,
    PRIMARY KEY (topic_id, objective_code)
);

CREATE INDEX idx_tup_tasks_doc ON tup_document_tasks (document_id);
CREATE INDEX idx_tup_hours_doc ON tup_subject_hours (document_id, grade);
CREATE INDEX idx_tup_quarters_doc ON tup_quarters (document_id, grade, quarter_number);
CREATE INDEX idx_tup_sections_quarter ON tup_sections (quarter_id);
CREATE INDEX idx_tup_topics_section ON tup_topics (section_id);
CREATE INDEX idx_tup_topic_objectives_obj ON tup_topic_objectives (objective_code);
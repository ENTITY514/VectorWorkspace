-- 0004: code целей — точный текст из ТУП (не GENERATED)
-- Геометрия 10-11 использует официальный 3-частный код (10.1.1),
-- остальные предметы — 4-частный (8.4.2.1). Колонка code хранит
-- исходную строку из документа (ADR: парсер — абсолютный фильтр).

CREATE TABLE learning_objectives_new (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    section_number INTEGER NOT NULL,
    subsection_number INTEGER NOT NULL,
    objective_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    code TEXT NOT NULL
);

INSERT INTO learning_objectives_new
    (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
SELECT id, document_id, grade, section_number, subsection_number, objective_number, description, code
FROM learning_objectives;

DROP TABLE learning_objectives;

ALTER TABLE learning_objectives_new RENAME TO learning_objectives;

CREATE INDEX idx_objectives_code ON learning_objectives (code);
CREATE INDEX idx_objectives_grade ON learning_objectives (document_id, grade);

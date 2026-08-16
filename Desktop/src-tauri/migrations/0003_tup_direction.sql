-- 0003: Направление обучения в документах ТУП (ЕМН / ОГН)
-- 10-11 классы делятся на естественно-математическое (emn) и
-- общественно-гуманитарное (ogn) направления. Это разные документы
-- с разными целями обучения (например, приложение 104 vs 105).
-- Для 7-9 классов направления нет — значение 'common'.

ALTER TABLE tup_documents
    ADD COLUMN direction TEXT NOT NULL DEFAULT 'common'
        CHECK (direction IN ('common', 'emn', 'ogn'));

CREATE INDEX idx_tup_documents_direction ON tup_documents (direction);

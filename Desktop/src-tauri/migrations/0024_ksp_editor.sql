-- Редактор КСП: статусы, язык, версии, история, справочник ценностей.
-- UNIQUE(ktp_lesson_id) сохраняется: один урок КТП — один КСП (v1).

ALTER TABLE ksp_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'approved', 'conducted', 'archived'));
ALTER TABLE ksp_documents ADD COLUMN language TEXT NOT NULL DEFAULT 'ru'
    CHECK (language IN ('ru', 'kk'));
ALTER TABLE ksp_documents ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ksp_documents ADD COLUMN class_name TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS ksp_revisions (
    id TEXT PRIMARY KEY,
    ksp_id TEXT NOT NULL REFERENCES ksp_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author TEXT NOT NULL CHECK (author IN ('user', 'agent', 'import')),
    reason TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS value_components (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title_ru TEXT NOT NULL,
    title_kk TEXT NOT NULL,
    source_document TEXT NOT NULL
);

INSERT OR IGNORE INTO value_components (id, code, title_ru, title_kk, source_document) VALUES
    ('val_diligence', 'diligence', 'Трудолюбие', 'Еңбекқорлық', 'adilet.zan.kz · ценности воспитания'),
    ('val_honesty', 'honesty', 'Честность', 'Шыншылдық', 'adilet.zan.kz · ценности воспитания'),
    ('val_respect', 'respect', 'Взаимоуважение', 'Өзара құрмет', 'adilet.zan.kz · ценности воспитания'),
    ('val_responsibility', 'responsibility', 'Ответственность', 'Жауапкершілік', 'adilet.zan.kz · ценности воспитания'),
    ('val_patriotism', 'patriotism', 'Патриотизм', 'Отаншылдық', 'adilet.zan.kz · ценности воспитания'),
    ('val_discipline', 'discipline', 'Самодисциплина', 'Өзін-өзі тәртіпке келтіру', 'adilet.zan.kz · ценности воспитания'),
    ('val_creativity', 'creativity', 'Творчество', 'Шығармашылық', 'adilet.zan.kz · ценности воспитания'),
    ('val_cooperation', 'cooperation', 'Сотрудничество', 'Ынтымақтастық', 'adilet.zan.kz · ценности воспитания');

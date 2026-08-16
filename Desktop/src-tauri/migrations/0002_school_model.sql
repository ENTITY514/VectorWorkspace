-- 0002: Модель учреждения (doc 12 §IX)
-- Бюрократия изолирована от педагогики; temporal integrity через is_active/valid_from/valid_to.

CREATE TABLE schools (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    region      TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE school_staff (
    id         TEXT PRIMARY KEY,
    school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    full_name  TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    valid_from TEXT NULL,
    valid_to   TEXT NULL
);

CREATE TABLE teacher_profiles (
    id         TEXT PRIMARY KEY,
    school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    full_name  TEXT NOT NULL,
    category   TEXT
);

CREATE TABLE classes (
    id        TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    grade     INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    letter    TEXT NOT NULL,
    language  TEXT NOT NULL CHECK (language IN ('RU', 'KK'))
);

CREATE INDEX idx_staff_school ON school_staff (school_id, role, is_active);
CREATE INDEX idx_classes_school ON classes (school_id, grade, letter);

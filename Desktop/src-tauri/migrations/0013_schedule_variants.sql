-- 0013: варианты расписания — поддержка нескольких годов и вариантов

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. Варианты расписания
-- ============================================================
CREATE TABLE schedule_variants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    academic_year TEXT NOT NULL CHECK (length(trim(academic_year)) > 0),
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    parent_variant_id TEXT REFERENCES schedule_variants(id) ON DELETE SET NULL
);

-- По умолчанию один активный вариант
INSERT INTO schedule_variants (id, name, academic_year, is_active)
VALUES ('default', 'Основное', '2025-2026', 1);

-- ============================================================
-- 2. Добавляем variant_id в schedule_slots.
--    SQLite не позволяет изменить UNIQUE-ограничения через ALTER,
--    поэтому пересоздаём таблицу с per-variant UNIQUE.
--    FK через ALTER ADD COLUMN с non-NULL default запрещён,
--    поэтому ссылка на schedule_variants реализована при rebuild.
-- ============================================================
CREATE TABLE schedule_slots_new (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    room_id TEXT NOT NULL REFERENCES schedule_rooms(id) ON DELETE RESTRICT,
    subgroup_label TEXT NOT NULL DEFAULT '' CHECK (length(trim(subgroup_label)) >= 0),
    day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 5),
    period INTEGER NOT NULL CHECK (period BETWEEN 0 AND 7),
    is_double INTEGER NOT NULL DEFAULT 0 CHECK (is_double IN (0,1)),
    variant_id TEXT NOT NULL DEFAULT 'default' REFERENCES schedule_variants(id) ON DELETE CASCADE,
    UNIQUE (class_id, day, period, subgroup_label, variant_id),
    UNIQUE (teacher_id, day, period, variant_id),
    UNIQUE (room_id, day, period, variant_id)
);

-- Переносим существующие слоты в вариант 'default'
INSERT INTO schedule_slots_new
    (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id)
SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, 'default'
FROM schedule_slots;

DROP TABLE schedule_slots;
ALTER TABLE schedule_slots_new RENAME TO schedule_slots;

CREATE INDEX idx_schedule_slots_class_day ON schedule_slots(class_id, day, variant_id);
CREATE INDEX idx_schedule_slots_teacher_day ON schedule_slots(teacher_id, day, variant_id);
CREATE INDEX idx_schedule_slots_room_day ON schedule_slots(room_id, day, variant_id);
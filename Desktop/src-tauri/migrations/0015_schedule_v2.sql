-- 0015: фиксированные слоты (pinned lessons) + quarter_number для teachers/classes

PRAGMA foreign_keys = ON;

-- Таблица фиксированных (закреплённых пользователем) слотов
CREATE TABLE IF NOT EXISTS schedule_fixed_slots (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES schedule_variants(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    day INTEGER NOT NULL CHECK(day BETWEEN 0 AND 5),
    period INTEGER NOT NULL CHECK(period BETWEEN 0 AND 7),
    subgroup_label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Уникальные ограничения: один слот на class/teacher/room в пределах варианта
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_class_day_period
    ON schedule_fixed_slots(class_id, day, period, subgroup_label, variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_teacher_day_period
    ON schedule_fixed_slots(teacher_id, day, period, variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_room_day_period
    ON schedule_fixed_slots(room_id, day, period, variant_id);

-- Индексы для быстрого поиска по варианту
CREATE INDEX IF NOT EXISTS idx_fixed_variant ON schedule_fixed_slots(variant_id);

-- Привязка учителей и классов к четверти (nullable = глобально)
ALTER TABLE schedule_teachers ADD COLUMN quarter_number INTEGER;
ALTER TABLE schedule_classes ADD COLUMN quarter_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_teachers_quarter ON schedule_teachers(quarter_number);
CREATE INDEX IF NOT EXISTS idx_classes_quarter ON schedule_classes(quarter_number);

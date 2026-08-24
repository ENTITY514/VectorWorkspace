-- 0010: домен расписания — справочники, матрица нагрузки, веса и результат
-- Изолированный контур schedule_* , не затрагивает tup/ktp/ksp

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. Кабинеты
-- ============================================================
CREATE TABLE schedule_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    room_type TEXT NOT NULL CHECK (room_type IN ('General','ChemistryLab','PhysicsLab','BiologyLab','Informatics','LanguageLab','Gym','Workshop')),
    capacity INTEGER NOT NULL CHECK (capacity > 0 AND capacity <= 200),
    base_teacher_id TEXT REFERENCES schedule_teachers(id) ON DELETE SET NULL,
    floor INTEGER CHECK (floor BETWEEN 1 AND 5)
);

-- ============================================================
-- 2. Учителя расписания (домен schedule, отделён от teacher_profiles)
-- ============================================================
CREATE TABLE schedule_teachers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
    base_room_id TEXT REFERENCES schedule_rooms(id) ON DELETE SET NULL,
    max_daily_lessons INTEGER NOT NULL DEFAULT 0 CHECK (max_daily_lessons BETWEEN 0 AND 10),
    availability_json TEXT NOT NULL
        CHECK (json_valid(availability_json))
);

-- ============================================================
-- 3. Классы (физические)
-- ============================================================
CREATE TABLE schedule_classes (
    id TEXT PRIMARY KEY,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 11),
    letter TEXT NOT NULL CHECK (length(trim(letter)) > 0),
    headcount INTEGER NOT NULL CHECK (headcount > 0 AND headcount <= 50),
    shift TEXT NOT NULL CHECK (shift IN ('First','Second')),
    UNIQUE (grade, letter)
);

-- ============================================================
-- 4. Правила деления на подгруппы
-- ============================================================
CREATE TABLE schedule_subgroup_rules (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL CHECK (length(trim(subject_id)) > 0),
    group_count INTEGER NOT NULL CHECK (group_count IN (2,3)),
    UNIQUE (class_id, subject_id)
);

-- ============================================================
-- 5. Предметы расписания (вес СанПиН, спецкабинет, split)
-- ============================================================
CREATE TABLE schedule_subjects (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sanitary_weight INTEGER NOT NULL CHECK (sanitary_weight BETWEEN 1 AND 10),
    required_room_type TEXT CHECK (required_room_type IN ('General','ChemistryLab','PhysicsLab','BiologyLab','Informatics','LanguageLab','Gym','Workshop')),
    requires_split INTEGER NOT NULL DEFAULT 0 CHECK (requires_split IN (0,1)),
    is_double_allowed INTEGER NOT NULL DEFAULT 0 CHECK (is_double_allowed IN (0,1)),
    related_subjects_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(related_subjects_json))
);

-- ============================================================
-- 6. Матрица нагрузки (Curriculum)
-- ============================================================
CREATE TABLE schedule_curriculum (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    split_teacher2_id TEXT REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    hours_per_week INTEGER NOT NULL CHECK (hours_per_week BETWEEN 1 AND 6),
    UNIQUE (class_id, subject_id),
    CHECK (split_teacher2_id IS NULL OR split_teacher2_id != teacher_id)
);

-- Триггер: если предмет requires_split=1, то split_teacher2_id обязателен
CREATE TRIGGER schedule_curriculum_split_check
BEFORE INSERT ON schedule_curriculum
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN (SELECT requires_split FROM schedule_subjects WHERE id = NEW.subject_id) = 1
             AND NEW.split_teacher2_id IS NULL
        THEN RAISE(ABORT, 'requires_split=1 requires split_teacher2_id')
    END;
END;

CREATE TRIGGER schedule_curriculum_split_check_upd
BEFORE UPDATE ON schedule_curriculum
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN (SELECT requires_split FROM schedule_subjects WHERE id = NEW.subject_id) = 1
             AND NEW.split_teacher2_id IS NULL
        THEN RAISE(ABORT, 'requires_split=1 requires split_teacher2_id')
    END;
END;

-- ============================================================
-- 7. Веса Soft-ограничений (singleton, id='default')
-- ============================================================
CREATE TABLE schedule_weights (
    id TEXT PRIMARY KEY DEFAULT 'default',
    window INTEGER NOT NULL DEFAULT 200 CHECK (window BETWEEN 0 AND 1000),
    room_displacement INTEGER NOT NULL DEFAULT 50 CHECK (room_displacement BETWEEN 0 AND 1000),
    sanpin_parabola INTEGER NOT NULL DEFAULT 100 CHECK (sanpin_parabola BETWEEN 0 AND 1000),
    alternation INTEGER NOT NULL DEFAULT 80 CHECK (alternation BETWEEN 0 AND 1000),
    movement INTEGER NOT NULL DEFAULT 20 CHECK (movement BETWEEN 0 AND 1000),
    load_balance INTEGER NOT NULL DEFAULT 30 CHECK (load_balance BETWEEN 0 AND 1000)
);

INSERT INTO schedule_weights (id) VALUES ('default');

-- ============================================================
-- 8. Результат расписания (перезаписывается при каждом solve)
-- ============================================================
CREATE TABLE schedule_slots (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    room_id TEXT NOT NULL REFERENCES schedule_rooms(id) ON DELETE RESTRICT,
    subgroup_label TEXT NOT NULL DEFAULT '' CHECK (length(trim(subgroup_label)) >= 0),
    day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 5),
    period INTEGER NOT NULL CHECK (period BETWEEN 0 AND 7),
    is_double INTEGER NOT NULL DEFAULT 0 CHECK (is_double IN (0,1)),
    UNIQUE (class_id, day, period, subgroup_label),
    UNIQUE (teacher_id, day, period),
    UNIQUE (room_id, day, period)
);

CREATE INDEX idx_schedule_slots_class_day ON schedule_slots(class_id, day);
CREATE INDEX idx_schedule_slots_teacher_day ON schedule_slots(teacher_id, day);
CREATE INDEX idx_schedule_slots_room_day ON schedule_slots(room_id, day);
CREATE INDEX idx_schedule_curriculum_class ON schedule_curriculum(class_id);
CREATE INDEX idx_schedule_curriculum_teacher ON schedule_curriculum(teacher_id);

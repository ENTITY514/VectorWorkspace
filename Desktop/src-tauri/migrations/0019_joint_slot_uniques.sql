-- 0019: снятие ограничений UNIQUE(teacher_id, day, period, variant_id) и UNIQUE(room_id, day, period, variant_id)
-- для поддержки совмещенных уроков (класс-комплектов / инклюзивных групп / единых кабинетов)
-- Уникальным для слотов является только класс + день + период + подгруппа + вариант.

PRAGMA foreign_keys = OFF;

CREATE TABLE schedule_slots_temp (
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
    joint_lesson_id TEXT,
    UNIQUE (class_id, day, period, subgroup_label, variant_id)
);

INSERT INTO schedule_slots_temp 
    (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id
FROM schedule_slots;

DROP TABLE schedule_slots;
ALTER TABLE schedule_slots_temp RENAME TO schedule_slots;

CREATE INDEX IF NOT EXISTS idx_slots_variant ON schedule_slots(variant_id);
CREATE INDEX IF NOT EXISTS idx_slots_class ON schedule_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_slots_teacher ON schedule_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_slots_room ON schedule_slots(room_id);
CREATE INDEX IF NOT EXISTS idx_slots_joint ON schedule_slots(joint_lesson_id);

PRAGMA foreign_keys = ON;

-- 0022: урок может не занимать кабинет.
--
-- Надомное обучение (класс с class_type='do') проходит у ученика дома.
-- Такой урок не занимает помещение и не конкурирует за него с очными
-- занятиями. Прежняя схема требовала room_id NOT NULL, из-за чего солверу
-- приходилось подставлять «первый попавшийся» кабинет, и занятие ложно
-- числилось занимающим помещение.
--
-- SQLite не умеет снимать NOT NULL через ALTER, поэтому таблица
-- пересоздаётся с сохранением данных.

PRAGMA foreign_keys = OFF;

CREATE TABLE schedule_slots_new (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    -- NULL = урок без кабинета (надомное обучение)
    room_id TEXT REFERENCES schedule_rooms(id) ON DELETE RESTRICT,
    subgroup_label TEXT NOT NULL DEFAULT '' CHECK (length(trim(subgroup_label)) >= 0),
    day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
    period INTEGER NOT NULL CHECK (period BETWEEN 0 AND 9),
    is_double INTEGER NOT NULL DEFAULT 0 CHECK (is_double IN (0,1)),
    variant_id TEXT NOT NULL DEFAULT 'default' REFERENCES schedule_variants(id) ON DELETE CASCADE,
    joint_lesson_id TEXT,
    UNIQUE (class_id, day, period, subgroup_label, variant_id)
);

INSERT INTO schedule_slots_new
    (id, class_id, subject_id, teacher_id, room_id, subgroup_label,
     day, period, is_double, variant_id, joint_lesson_id)
SELECT id, class_id, subject_id, teacher_id,
       NULLIF(TRIM(room_id), ''), subgroup_label,
       day, period, is_double, variant_id, joint_lesson_id
FROM schedule_slots;

DROP TABLE schedule_slots;
ALTER TABLE schedule_slots_new RENAME TO schedule_slots;

CREATE INDEX IF NOT EXISTS idx_slots_variant ON schedule_slots(variant_id);
CREATE INDEX IF NOT EXISTS idx_slots_class ON schedule_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_slots_teacher ON schedule_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_slots_room ON schedule_slots(room_id);
CREATE INDEX IF NOT EXISTS idx_slots_joint ON schedule_slots(joint_lesson_id);
CREATE INDEX IF NOT EXISTS idx_slots_teacher_slot ON schedule_slots(variant_id, teacher_id, day, period);
CREATE INDEX IF NOT EXISTS idx_slots_room_slot ON schedule_slots(variant_id, room_id, day, period);

PRAGMA foreign_keys = ON;

-- Осиротевших ссылок после пересоздания быть не должно.
-- (Проверку выполняет тест миграций: PRAGMA foreign_key_check.)

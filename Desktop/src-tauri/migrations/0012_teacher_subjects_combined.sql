-- 0012: добавить предметы и флаг совмещённого в schedule_teachers

PRAGMA foreign_keys = ON;

ALTER TABLE schedule_teachers ADD COLUMN subject_ids TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(subject_ids));

ALTER TABLE schedule_teachers ADD COLUMN is_combined INTEGER NOT NULL DEFAULT 0
    CHECK (is_combined IN (0,1));

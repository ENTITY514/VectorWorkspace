-- 0017: включить quarter_number в UNIQUE-ограничение schedule_classes
-- Чтобы одна и та же буква/класс могла существовать в разных четвертях (портирование).
PRAGMA foreign_keys=OFF;
CREATE TABLE schedule_classes_new (
    id TEXT PRIMARY KEY,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 11),
    letter TEXT NOT NULL CHECK (length(trim(letter)) >= 0),
    headcount INTEGER NOT NULL CHECK (headcount > 0 AND headcount <= 50),
    shift TEXT NOT NULL CHECK (shift IN ('First','Second')),
    class_type TEXT NOT NULL DEFAULT 'normal' CHECK (class_type IN ('normal','do','luo')),
    quarter_number INTEGER,
    UNIQUE (grade, letter, class_type, quarter_number)
);
INSERT INTO schedule_classes_new (id, grade, letter, headcount, shift, class_type, quarter_number)
    SELECT id, grade, letter, headcount, shift, class_type, quarter_number FROM schedule_classes;
DROP TABLE schedule_classes;
ALTER TABLE schedule_classes_new RENAME TO schedule_classes;
PRAGMA foreign_keys=ON;

CREATE INDEX IF NOT EXISTS idx_classes_quarter ON schedule_classes(quarter_number);

-- Для глобальных классов (quarter_number IS NULL) сохраняем строгую уникальность grade+letter+class_type
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_global ON schedule_classes(grade, letter, class_type) WHERE quarter_number IS NULL;
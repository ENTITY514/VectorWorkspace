-- 0011: добавить тип класса для ДО/ЛУО разделения
PRAGMA foreign_keys=OFF;
CREATE TABLE schedule_classes_new (
    id TEXT PRIMARY KEY,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 11),
    letter TEXT NOT NULL CHECK (length(trim(letter)) >= 0),
    headcount INTEGER NOT NULL CHECK (headcount > 0 AND headcount <= 50),
    shift TEXT NOT NULL CHECK (shift IN ('First','Second')),
    class_type TEXT NOT NULL DEFAULT 'normal' CHECK (class_type IN ('normal','do','luo')),
    UNIQUE (grade, letter, class_type)
);
-- Для свежей БД старая таблица без class_type, поэтому вставляем 'normal' по умолчанию
INSERT INTO schedule_classes_new (id, grade, letter, headcount, shift, class_type)
    SELECT id, grade, letter, headcount, shift, 'normal' FROM schedule_classes;
DROP TABLE schedule_classes;
ALTER TABLE schedule_classes_new RENAME TO schedule_classes;
PRAGMA foreign_keys=ON;

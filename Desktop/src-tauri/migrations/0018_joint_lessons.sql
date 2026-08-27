-- 0018: поддержка совмещенных уроков (класс-комплекты / инклюзия / ЛУО)
-- Добавление поля joint_lesson_id в матрицу нагрузки и результаты расписания

PRAGMA foreign_keys = ON;

-- Поле связки совмещенных уроков в матрице нагрузки
ALTER TABLE schedule_curriculum ADD COLUMN joint_lesson_id TEXT;

-- Поле связки совмещенных уроков в результирующих слотах
ALTER TABLE schedule_slots ADD COLUMN joint_lesson_id TEXT;

-- Поле связки совмещенных уроков в фиксированных слотах
ALTER TABLE schedule_fixed_slots ADD COLUMN joint_lesson_id TEXT;

-- Индексы для ускорения выборок совмещенных уроков
CREATE INDEX IF NOT EXISTS idx_curriculum_joint ON schedule_curriculum(joint_lesson_id);
CREATE INDEX IF NOT EXISTS idx_slots_joint ON schedule_slots(joint_lesson_id);

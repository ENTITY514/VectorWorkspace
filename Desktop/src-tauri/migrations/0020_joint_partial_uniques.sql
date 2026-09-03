-- 0020: восстановление инварианта накладок с поддержкой совмещённых уроков.
--
-- Миграция 0019 сняла UNIQUE(teacher_id, day, period, variant_id) и
-- UNIQUE(room_id, day, period, variant_id), чтобы разрешить класс-комплекты,
-- но взамен не дала ничего: с тех пор БД молча принимала любую накладку.
--
-- Корректное правило: дубликат учителя/кабинета в слоте допустим ТОЛЬКО
-- внутри совмещённого урока. Частичный уникальный индекс выражает это точно:
-- строки с joint_lesson_id IS NULL обязаны быть уникальны, joint-строки — нет.

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. schedule_slots: накладки запрещены вне joint-групп
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_slots_teacher_solo
    ON schedule_slots(teacher_id, day, period, variant_id)
    WHERE joint_lesson_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_slots_room_solo
    ON schedule_slots(room_id, day, period, variant_id)
    WHERE joint_lesson_id IS NULL;

-- Внутри одной joint-группы учитель занимает слот один раз:
-- защищает от дублей при повторном импорте того же совмещённого урока.
CREATE UNIQUE INDEX IF NOT EXISTS uq_slots_teacher_joint
    ON schedule_slots(teacher_id, day, period, variant_id, joint_lesson_id, class_id)
    WHERE joint_lesson_id IS NOT NULL;

-- ============================================================
-- 2. schedule_fixed_slots: те же правила
--    Старые индексы из 0015 не знают о joint и делают закрепление
--    совмещённого урока физически невозможным — заменяем.
-- ============================================================
DROP INDEX IF EXISTS uq_fixed_teacher_day_period;
DROP INDEX IF EXISTS uq_fixed_room_day_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_teacher_solo
    ON schedule_fixed_slots(teacher_id, day, period, variant_id)
    WHERE joint_lesson_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_room_solo
    ON schedule_fixed_slots(room_id, day, period, variant_id)
    WHERE joint_lesson_id IS NULL;

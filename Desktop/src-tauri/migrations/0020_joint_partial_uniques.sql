-- 0020: индексы под инвариант накладок с учётом совмещённых уроков.
--
-- КОНТЕКСТ. Миграция 0019 сняла UNIQUE(teacher_id, day, period, variant_id) и
-- UNIQUE(room_id, day, period, variant_id), чтобы разрешить класс-комплекты,
-- но взамен не дала ничего: с тех пор БД молча принимала любую накладку.
--
-- ПОЧЕМУ ЗДЕСЬ НЕ UNIQUE. Восстановить уникальность частичным индексом
-- (WHERE joint_lesson_id IS NULL) нельзя: накопленные данные её нарушают.
-- Замер на боевой базе — 63 конфликтных слота по кабинетам в варианте
-- `default`, 35 в `v3_q4`, 2 в `v2_q4` (накладок учителей при этом нет).
-- Причина конфликтов — эвристика в solver/constraints/hard.py, которая
-- молча отключала жёсткое ограничение H4b на моделях больше 80 000
-- переменных, то есть всегда на боевом размере задачи.
-- UNIQUE-индекс на таких данных сделал бы миграцию невыполнимой, и
-- приложение не запустилось бы вообще.
--
-- ГДЕ ТОГДА ИНВАРИАНТ. Он проверяется на стороне приложения перед записью:
-- SolverHost::validate_hard отвергает решение, в котором учитель или кабинет
-- заняты дважды вне общей joint-группы. Новые расписания конфликтов не
-- содержат; исторические остаются как есть до перегенерации и видны через
-- отчёт о конфликтах.
--
-- Индексы ниже — для скорости этого отчёта и выборок по слотам.

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_slots_teacher_slot
    ON schedule_slots(variant_id, teacher_id, day, period);

CREATE INDEX IF NOT EXISTS idx_slots_room_slot
    ON schedule_slots(variant_id, room_id, day, period);

-- ============================================================
-- schedule_fixed_slots: закрепления создаёт пользователь, исторических
-- конфликтов там нет (одна строка на всю базу), поэтому здесь инвариант
-- восстанавливается по-настоящему — частичными UNIQUE-индексами.
--
-- Старые индексы из 0015 не знали о joint и делали закрепление
-- совмещённого урока физически невозможным.
-- ============================================================
DROP INDEX IF EXISTS uq_fixed_teacher_day_period;
DROP INDEX IF EXISTS uq_fixed_room_day_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_teacher_solo
    ON schedule_fixed_slots(teacher_id, day, period, variant_id)
    WHERE joint_lesson_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_room_solo
    ON schedule_fixed_slots(room_id, day, period, variant_id)
    WHERE joint_lesson_id IS NULL;

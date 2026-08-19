-- 0008: язык плана КТП и самодостаточные цели урока.
-- language: язык документа ТУП, из которого сгенерирован план (RU/KK).
-- objectives_json: [{"code": "...", "description": "..."}] — полные цели урока
-- (включая введённые/отредактированные учителем), источник истины для редактора.
-- Связь ktp_lesson_objectives остаётся зеркалом для целей, резолвимых в learning_objectives.

ALTER TABLE ktp_plans ADD COLUMN language TEXT NOT NULL DEFAULT 'RU';

ALTER TABLE ktp_lessons ADD COLUMN objectives_json TEXT NOT NULL DEFAULT '[]';
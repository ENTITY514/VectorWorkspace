-- Адаптированная цель урока (для обучающегося с ООП): колонка импорта КТП.
ALTER TABLE ktp_lessons ADD COLUMN adapted_objective TEXT NOT NULL DEFAULT '';

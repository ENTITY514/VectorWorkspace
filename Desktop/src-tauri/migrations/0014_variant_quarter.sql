-- 0014: расширяем schedule_variants — номер четверти и номер варианта

PRAGMA foreign_keys = ON;

-- Добавляем поля для навигации: Год → Четверть → Вариант
ALTER TABLE schedule_variants ADD COLUMN quarter_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedule_variants ADD COLUMN variant_number INTEGER NOT NULL DEFAULT 1;

-- Уникальный индекс: один вариант на четверть
CREATE UNIQUE INDEX uq_variant_year_quarter ON schedule_variants(academic_year, quarter_number, variant_number);

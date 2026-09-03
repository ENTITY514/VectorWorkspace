-- 0021: сетка времени как данные, а не как литералы в коде.
--
-- Размер сетки был зашит минимум в четырёх местах: дважды в
-- commands/schedule.rs (пре-валидатор 6x7 и time_grid 6x7), в CHECK-ах
-- миграций (day 0..5, period 0..7) и в условии engine.py. Продукт при
-- этом уже перешёл на 5x7 — фактические данные лежат в диапазоне
-- day 0..4, period 0..6, то есть код передавал солверу неверную сетку.
--
-- Значения по умолчанию соответствуют реальным данным: 5 дней x 7 уроков.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schedule_settings (
    id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
    days_per_week INTEGER NOT NULL DEFAULT 5 CHECK (days_per_week BETWEEN 1 AND 7),
    periods_per_day INTEGER NOT NULL DEFAULT 7 CHECK (periods_per_day BETWEEN 1 AND 10),
    -- Урок, с которого начинается вторая смена. NULL = смен нет.
    -- Прежняя логика включала фильтр смен только при periods_per_day >= 8,
    -- из-за чего на сетке 5x7 смены не работали вовсе.
    shift_boundary_period INTEGER CHECK (shift_boundary_period BETWEEN 1 AND 9)
);

INSERT OR IGNORE INTO schedule_settings (id, days_per_week, periods_per_day, shift_boundary_period)
VALUES ('default', 5, 7, NULL);

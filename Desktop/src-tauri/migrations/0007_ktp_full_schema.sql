-- 0007: Фаза 4 — интерактивный редактор КТП.
-- Базовая схема КТП создана в 0001 (ktp_plans/quarters/lessons/lesson_objectives).
-- Здесь добавляется расписание предмета (дни недели) и сервисные индексы.

-- Дни недели расписания предмета: CSV ISO-номеров (1=Пн ... 7=Вс),
-- например "2,4" — вторник и четверг. Используются для авторасчёта дат
-- уроков по производственному календарю РК (FR-2.4).
ALTER TABLE ktp_plans ADD COLUMN days_of_week TEXT NOT NULL DEFAULT '';

-- Индекс выборки уроков четверти по порядку.
CREATE INDEX IF NOT EXISTS idx_ktp_lessons_quarter ON ktp_lessons (quarter_id, quarter_index);

-- Индекс поиска уроков по физической дате (фильтры календаря).
CREATE INDEX IF NOT EXISTS idx_ktp_lessons_date ON ktp_lessons (planned_date);
# 04. Методический контур: КТП (Календарно-тематическое планирование)

## Обзор

КТП строится на базе ТУП и разбивается на четверти и уроки с типизацией.

```
KtpPlan ──► QuarterPlan (1..4) ──► Lesson (1..N) [Standard | Sor | Soch | Revision]
```

## Требования

### FR-2.1. Конечный автомат статусов
```
Draft ──► Validating ──► Approved ──► Archived
```
Статусы зашиты в `CHECK`-ограничение таблицы `ktp_plans`.

### FR-2.2. Инвариант оценивания (дистанция СОР → СОЧ)
Между уроком последнего СОР и уроком СОЧ строго соблюдается дистанция **в один промежуточный урок**:

```
Index(Soch) - Index(Last_Sor) = 2
```

### FR-2.3. Буферная зона нагрузки
Количество уроков после СОЧ до конца четверти не может быть меньше недельной часовой нагрузки предмета:

```
TotalLessons_quarter - Index(Soch) >= HoursPerWeek
```

### FR-2.4. Адаптивный календарный сдвиг
Разделение **логических индексов** уроков (1..N) и **физического календаря**:
- сдвиг дат праздниками/каникулами не нарушает методические интервалы между контрольными срезами;
- даты назначаются с учётом календаря РК, но логическая нумерация уроков остаётся методическим эталоном.

## Схема данных

```sql
CREATE TABLE ktp_plans (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    academic_year TEXT NOT NULL,
    total_hours INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Validating', 'Approved', 'Archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE ktp_quarters (
    id TEXT PRIMARY KEY,
    ktp_id TEXT NOT NULL REFERENCES ktp_plans(id) ON DELETE CASCADE,
    quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
    hours_per_week INTEGER NOT NULL CHECK (hours_per_week > 0),
    UNIQUE (ktp_id, quarter_number)
);

CREATE TABLE ktp_lessons (
    id TEXT PRIMARY KEY,
    quarter_id TEXT NOT NULL REFERENCES ktp_quarters(id) ON DELETE CASCADE,
    global_index INTEGER NOT NULL,      -- логический индекс 1..N
    quarter_index INTEGER NOT NULL,     -- индекс внутри четверти
    topic_title TEXT NOT NULL,
    lesson_type TEXT NOT NULL
        CHECK (lesson_type IN ('Standard', 'Sor', 'Soch', 'Revision')),
    planned_date TEXT NULL,             -- физический календарь
    is_cancelled INTEGER NOT NULL DEFAULT 0,
    UNIQUE (quarter_id, quarter_index)
);

CREATE TABLE ktp_lesson_objectives (
    lesson_id TEXT NOT NULL REFERENCES ktp_lessons(id) ON DELETE CASCADE,
    objective_id TEXT NOT NULL REFERENCES learning_objectives(id) ON DELETE RESTRICT,
    PRIMARY KEY (lesson_id, objective_id)
);
```

## Где реализуются инварианты
- **FR-2.2, FR-2.3** — в валидаторах ядра Rust (InvariantGuillotine) и MCP Tool Registry при `draft_ktp`/`validate_ktp`.
- **FR-2.4** — в сервисе адаптивного календаря (календарь РК, переносы, буфер недельной нагрузки).
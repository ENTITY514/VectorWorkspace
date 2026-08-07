# Roadmap: будущие продукты

Цель — экосистема на общем auth/каталоге, а не набор несвязанных сайтов.

## 1. KSP Editor (краткосрочные / поурочные планы)

**Идея:** учитель выбирает тему из ТУП/КТП (или блока `tup_topics`) и собирает КСП: цели, ход урока, ресурсы, ДЗ, дифференциация.

**Предлагаемые таблицы:**

- `ksp_documents` — metadata + `status` + `owner_id` + `source_ktp_id` / `source_tup_topic_id`
- `ksp_sections` / блоки урока (JSONB snapshot + нормализация по необходимости)
- шаблоны школы: `ksp_templates`

**Приложение:** `/KSPHUB` (или `apps/ksp`), тот же Supabase, отдельные routes/UI.

**Интеграция с KTPHUB:** deep-link «Создать КСП из этой темы» из редактора КТП.

## 2. Logic Course (курс / тренажёр логики)

**Идея:** модули → уроки → задания; прогресс ученика; возможно отдельная роль `student`.

**Предлагаемые таблицы:**

- `course_modules`, `course_lessons`, `course_tasks`
- `course_progress` (`user_id`, `task_id`, `state`, `score`)
- контент может жить в Storage / MDX / JSON

**Auth:** те же `profiles`; роль расширить через `school_members` или `product_roles`, не ломая `teacher|admin`.

## 3. Shared Hub / облако КТП (уже частично)

- библиотека чужих published КТП (есть каркас каталога)
- рейтинги, форки, школьные коллекции
- sync черновиков учителя (сейчас local-only)

## 4. Интеграции РК

См. также `KTPHUB/docs/ideas/TOP_IDEAS.md`:

- календарь РК / переносы праздников / актировки
- экспорт Kundelik / BilimLand
- полноценный kk/ru/en в документах

## Порядок внедрения (рекомендуемый)

1. Стабилизировать KTPHUB auth + каталоги + admin ТУП (текущая фаза).
2. Вынести `packages/platform-sdk` (auth client, cache, profile).
3. Запустить KSP editor на тех же profiles + связь с `tup_topics` / КТП.
4. Logic course как отдельное приложение с `course_*` таблицами.
5. При росте нагрузки — выделить Nest API, Supabase остаётся Auth+DB или только DB.

## Правило для схемы

Каждый новый продукт = **свой префикс таблиц** + свои repository interfaces.  
Общее только: `profiles`, auth, при необходимости `school_*`.

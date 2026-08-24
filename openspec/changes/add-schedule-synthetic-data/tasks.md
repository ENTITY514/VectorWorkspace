## 1. Парсер недельного шаблона (xlrd → JSON)

- [x] 1.1 Создать `solver/tools/import_legacy_schedule.py` — CLI `python -m solver.tools.import_legacy_schedule --materials Materials/Таблицы\ расписаний --out data/synthetic`:
  - Сканирует `*.xls`, читает `xlrd` лист `Calendar`, строки 0 (`Класс: X-Y[ ДО| ЛУО]`→`type`), 1 (`N четверть`→`q`), 2-3 заголовки дней, находит первую полную неделю (5 дней пн-пт, каждый ≥3 непустых ячеек, иначе мажоритарная).
  - Парсит ячейку `A\nB\nC\nD` → `subject_raw, teacher_raw, time_raw, room_raw` (`\n` split), нормализует `ФИО→slug`, `предмет→id` через `SUBJECT_SYNONYMS` (40+), `кабинет→RoomType`, `период` по строке `1.0..7.0`, `day` по колонке `пн..пт`.
  - Инференс: собирает `catalog` (уникальные teachers/classes/rooms/subjects), `schedule_legacy_qN` (слоты `class_id, subject_id, teacher_id, room_id, day, period, quarter, class_type`), `curriculum_qN` (агрегация `class×subject×teacher hours_per_week` из недельного шаблона, `split_teacher2_id` если в одном слоте два учителя разных групп — пока null).
  - Пишет `data/synthetic/catalog.json`, `curriculum_q1-4.json`, `schedule_legacy_q1-4.json`, лог `unknown_subjects.json`.
- [x] 1.2 Словари нормализации `solver/tools/subject_synonyms.py` (kz/ru→id, `бейнелеу→изо`, `Әліппе→букварь`, `Дене→физкультура`) и `room_inference.py` (`начальные→General`, `спортивный→Gym`).
- [x] 1.3 Тест парсера на 3 файлах (1-а Q1, 5-б ДО Q2, 6-а ЛУО Q3) — `pytest solver/tools/tests/test_import_legacy.py` (проверка `week_template` 5×7, `ДО/ЛУО` тип, `room_type`).

## 2. Каталоги синтетики и заливка в БД

- [x] 2.1 Структура `data/synthetic/` (`.gitkeep`, `README.md`): `catalog.json` (`teachers[]{id,display_name,slug}`, `classes[]{id,grade,letter,type}`, `rooms[]{id,name,room_type}`, `subjects[]{id,name,sanitary_weight,required_room_type}`), `curriculum_qN.json`, `schedule_legacy_qN.json` (по 5×7 слотов на класс).
- [x] 2.2 Rust `src/commands/schedule.rs` — `schedule_import_legacy(catalog_path: String)` (читает `catalog.json`+`curriculum_qN.json`, транзакция `DELETE+INSERT` в `schedule_teachers/rooms/classes/subjects/curriculum`, `subgroup_rules` из `class.type`), `schedule_get_legacy(quarter: u8)` (читает `schedule_legacy_qN.json` → `Vec<ScheduleSlot>`).
- [x] 2.3 `scheduleApi.importLegacy(quarter)` + `getLegacy(quarter)` в `Desktop/src/domains/schedule/api.ts`.

## 3. Бенчмарк CP-SAT vs ручное (все метрики)

- [x] 3.1 `solver/tools/benchmark.py` — CLI `python -m solver.tools.benchmark --quarters 1-4 --weights data/synthetic/weights.json`:
  - Загружает `catalog+curriculum_qN`, строит `InputModel` (как `schedule_generate`), `our = solve(InputModel)` (с `time_limit 30s`), считает `our_penalties` из `our` + `legacy_penalties` (вызов `add_soft_constraints` только для подсчёта на legacy-слотах без `Minimize`).
  - Пишет `data/synthetic/benchmark_qN.json` (`quarter, legacy:{penalties,total}, our:{penalties,total,status,wall_ms}, delta:{total, per_metric}, infeasible_core if any`) и `benchmark_summary.json` (таблица Q1..Q4, средние `delta_window`, `delta_sanpin` и т.д.).
  - Метрики: `window, room_displacement, sanpin_parabola, alternation, movement, load_balance, wall_ms, status`.
- [x] 3.2 `pytest solver/tools/tests/test_benchmark.py` (на `q1` weekly: `legacy_penalty` считается, `our` `FEASIBLE`, `benchmark_q1.json` валиден).

## 4. UI просмотра legacy и сравнения

- [x] 4.1 `Desktop/src/domains/schedule/components/LegacyView.tsx` — пикер `Q1..Q4`, фильтр `type: all|normal|do|luo`, грид 5×7 (как `TimetableGrid`), данные из `schedule_get_legacy`, read-only.
- [x] 4.2 `BenchmarkView.tsx` — таблица `Q1..Q4` (`legacy_total` vs `our_total` + `delta` спарклайн), карточки по метрикам (`window -12`, `sanpin -8`), бейдж `лучше/хуже`.
- [x] 4.3 `SchedulePage.tsx` — вкладки `Легаси` + `Сравнение` (рядом с `Грид`), `scheduleApi.getLegacy`.
- [x] 4.4 `docs/schedule/legacy-analysis.md` — auto-generated сводка из `benchmark_summary.json` (таблицы, выводы «наш лучше на X% по окнам, хуже на Y% по СанПиН»).

## 5. Проверка и сдача

- [x] 5.1 `python -m solver.tools.import_legacy_schedule` → 9 JSON в `data/synthetic/` (проверка `N классов`, `N учителей` vs 115 файлов).
- [x] 5.2 `schedule_import_legacy` → `cargo test` 104 passed + `SELECT COUNT(*) FROM schedule_*` совпадает с `catalog.json`.
- [x] 5.3 `python -m solver.tools.benchmark` → `benchmark_q1-4.json` + `summary` (`wall_ms<30s`, `our_total < legacy_total` на ≥3/4 четвертях).
- [x] 5.4 `npm run build` + `schedule_get_legacy` в UI (грид Q1 показывает 1-а Пн 1 урок `Букварь`).
- [x] 5.5 Обновить `openspec/specs/synthetic-schedule/spec.md` (поквартальные недельные модели, `type` разделение, JSON).

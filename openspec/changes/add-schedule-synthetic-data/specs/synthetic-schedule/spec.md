# Spec: synthetic-schedule (delta)

## ADDED Requirements

### Requirement: Legacy Weekly Template (Quarter)

Система SHALL парсить `Materials/Таблицы расписаний/*.xls` (строка 0 `Класс: X-Y[ ДО| ЛУО]`, строка 1 `N четверть`) и для каждой четверти `q=1..4` извлекать недельный шаблон 5×7 (Пн-Пт, периоды 1..7) как первую полную неделю (5 дней, каждый ≥3 непустых ячеек; иначе мажоритарная ячейка по `(day,period)`). Ячейка `Предмет\nФИО\nВремя\nКабинет` SHALL нормализоваться (`ФИО→slug`, `предмет→id` через словарь 40+, `кабинет→RoomType`).

#### Scenario: Parse 1-a Q1 weekly

- **WHEN** парсится `schedule.xls` (Класс: 1-а, 1 четверть) — **THEN** `schedule_legacy_q1.json` содержит для `c_1_a` 5×7 слотов недели 2 (напр. `Вт 1 период: Әліппе Жекеева`),
- **AND** `class.type == normal`, `subject_id` нормализован (`бейнелеу→изо`), `room_type` `General`.

### Requirement: Catalog and Curriculum Synthesis

Парсер SHALL агрегировать `catalog.json` (`teachers[]` slug+display, `classes[]` с `type ∈ {normal,do,luo}`, `rooms[]` инференс, `subjects[]` с `sanitary_weight`) и `curriculum_qN.json` (`class_id×subject_id×teacher_id×hours_per_week`, `hours` из недельного шаблона, `split_teacher2_id=null` на этом этапе).

#### Scenario: DO/LUO separation

- **WHEN** файл `Класс: 5-б ДО` парсится — **THEN** `classes` содержит `type=do`, в `curriculum_q2.json` его нагрузка отдельна от `normal`.

### Requirement: JSON Storage (Programmatic)

Система SHALL хранить синтетику как JSON в `data/synthetic/` (`catalog.json`, `curriculum_qN.json`, `schedule_legacy_qN.json`), читаемые программно (без SQLite на этом этапе). Заливка в `schedule_*` SHALL быть отдельной командой `schedule_import_legacy` (транзакция).

#### Scenario: JSON readable

- **WHEN** `catalog.json` сгенерирован — **THEN** `python -c "import json; json.load(open('data/synthetic/catalog.json'))"` успешен,
- **AND** `schedule_import_legacy` заливает те же данные в `schedule_teachers/rooms/classes/subjects/curriculum` (`COUNT(*)` совпадает).

### Requirement: Benchmark All Metrics

Система SHALL на каждом `qN` прогонять `engine.solve(curriculum_qN)` (CP-SAT, `weights` по умолчанию, `time_limit 30s`) и считать `legacy_penalties` теми же `soft.py` функциями на `schedule_legacy_qN` слотах, писать `benchmark_qN.json` (`legacy:{penalties,total}`, `our:{penalties,total,status,wall_ms}`, `delta`) + `benchmark_summary.json` (таблица по всем метрикам `window, room_displacement, sanpin_parabola, alternation, movement, load_balance, wall_ms`).

#### Scenario: Benchmark Q1

- **WHEN** `benchmark.py --quarters 1` запущен — **THEN** `benchmark_q1.json` содержит `delta.total` (отрицательный если наш лучше),
- **AND** `legacy_penalty` и `our_penalty` посчитаны одинаковыми весами.

### Requirement: Legacy UI View

Вкладка `Расписание → Легаси` SHALL показывать недельный грид 5×7 read-only по четвертям (`Q1..Q4`), фильтр `type` (`all|normal|do|luo`), данные из `schedule_get_legacy(quarter)`.

#### Scenario: Legacy grid Q1

- **WHEN** в UI выбрано `Q1` и фильтр `1-а` — **THEN** грид показывает `Пн 2 урок: Математика Жекеева` как в исходном `schedule.xls` неделе 2.

### Requirement: Comparison UI and Report

Система SHALL показывать `BenchmarkView` (таблица Q1..Q4 `legacy_total` vs `our_total` + `delta` по всем метрикам) и генерировать `docs/schedule/legacy-analysis.md` из `benchmark_summary.json`.

#### Scenario: Comparison shows improvement

- **WHEN** `benchmark_summary.json` содержит `avg_delta_window = -3.2` — **THEN** UI показывает `Окна: лучше на 3.2` зелёным.

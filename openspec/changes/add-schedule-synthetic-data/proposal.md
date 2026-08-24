## Why

Прошлые расписания школы (115 × .xls в `Materials/Таблицы расписаний/`) лежат в виде календарных таблиц `Класс: 1-а … 1 четверть` с ячейками `Предмет\nФИО\nВремя\nКабинет` и вручную разнесены по неделям 1..8. Текущая модель `schedule_*` пуста — проверить CP-SAT не на чем, сравнить с ручной работой завуча невозможно. Нужны:
- достоверная синтетика (классы, учителя, кабинеты, нагрузка) из прошлого года как ground truth;
- поквартальная недельная модель (5×7 слотов) в JSON, читаемая программно и UI;
- честный бенчмарк наш алгоритм vs ручное распределение по всем метрикам (окна, СанПиН-парабола, чередование, изгнание, баланс).

ДО (`дистанционное`) и ЛУО (`лёгкая УО`) — отдельные контингенты с другим учебным планом — нельзя смешивать с нормой.

## What Changes

- **Парсер `solver/tools/import_legacy_schedule.py` (xlrd → JSON):** читает все 115 `.xls`, строка 0 `Класс: X-Y[ ДО| ЛУО]` → `type=normal|do|luo`, строка 1 `N четверть` → `quarter`, берёт первую полную неделю (5 дней Пн-Пт × до 7 периодов) как недельный шаблон (`week_template`), нормализует `ФИО` (`Квашнина Е.В.` → `kvashnina_e_v`), `предмет` (синонимы `бейнелеу өнері→ИЗО`, `Дене шынықтыру→Физкультура`), `кабинет` (`начальные класс…→General`, `спортивный зал→Gym`).
- **Каталоги синтетики `data/synthetic/`:** `catalog.json` — уникальные `teachers[]`, `classes[]` (с `type`), `rooms[]` (инференс пула из кабинетов), `subjects[]` (вес СанПиН); `curriculum_q{1-4}.json` — `class_id × subject_id × teacher_id(+split2) × hours_per_week`; `schedule_legacy_q{1-4}.json` — недельные слоты `class_id, subject_id, teacher_id, room_id, day, period, quarter` (источник ручного расписания).
- **Интеграция в БД:** команда `schedule_import_legacy` (`Desktop/src-tauri/src/commands/schedule.rs`) — заливка `catalog+curriculum` в `schedule_*` (транзакция, `schedule_slots` не трогает legacy — legacy только JSON для просмотра/сравнения).
- **Бенчмарк `solver/tools/benchmark.py`:** на каждом `curriculum_qN` прогоняет `engine.solve` (наш CP-SAT, `weights` по умолчанию) и считает метрики на legacy-слотах той же четверти теми же функциями `penalties` (окна, СанПиН, чередование, изгнание, баланс); пишет `data/synthetic/benchmark_q{1-4}.json` + сводку `benchmark_summary.json` (таблица «ручное vs наше» по всем метрикам + `wall_ms`, `gap`).
- **UI просмотра:** вкладка `Расписание → Легаси` (read-only) — выбор четверти `Q1..Q4`, фильтр по классу/учителю, грид 5×7 недельный (как `TimetableGrid`), бейдж типа `ДО/ЛУО`.

## Capabilities

### New Capabilities
- `synthetic-schedule`: Импорт, нормализация и хранение синтетических данных прошлого года (каталоги, нагрузка, недельные слоты по четвертям) + бенчмарк CP-SAT vs ручное расписание.

### Modified Capabilities
- `schedule`: Расширение `schedule_import_legacy` и UI `schedule/legacy` для просмотра поквартальных недельных моделей.

## Impact

- `solver/tools/import_legacy_schedule.py` — новый парсер (xlrd, нормализация, инференс комнат/весов).
- `solver/tools/benchmark.py` — новый бенчмарк (переиспользует `engine.solve` и `constraints/soft` для подсчёта метрик legacy).
- `data/synthetic/` — 9 JSON (`catalog.json`, `curriculum_q1-4.json`, `schedule_legacy_q1-4.json`, `benchmark_*.json`), `.gitkeep` + README.
- `Desktop/src-tauri/src/commands/schedule.rs` — `schedule_import_legacy` + `schedule_get_legacy` (чтение JSON, заливка `schedule_*`).
- `Desktop/src/domains/schedule/` — `LegacyView.tsx` (четверть-пикер, грид), `scheduleApi.getLegacy(quarter)`.
- `docs/schedule/legacy-analysis.md` — сводный отчёт сравнения (таблицы, выводы).

## Why

Школа тратит 2-3 дня ручной работы завуча на составление расписания, при этом результат содержит коллизии (учитель в двух классах одновременно, кабинет занят), окна у учителей, нарушение СанПиН (пик нагрузки не во вторник/среду) и не учитывает деление на подгруппы (английский/информатика требуют 2 учителя+2 кабинета параллельно). Текущий VectorWorkspace не имеет модуля расписания; существующие домены ТУП/КТП/КСП не покрывают STP (NP-Hard). В `openspec/specs/schedule-generator/{design,prerequisites}.md` зафиксирован исследовательский анализ: ручные `for/if` и генетические алгоритмы не дают гарантии 0 коллизий и застревают в локальных минимумах. Нормативная база (ТУП, Приказ МЗ РК № ҚР ДСМ-76, ГОСО) требует формализации весов сложности и смен.

Нужна производственная система генерации расписания класса NP-Hard с математической гарантией: 0 коллизий по Hard, минимизация штрафов по Soft, ≤60 сек на типовой школе, диагностика INFEASIBLE вместо падения, офлайн (Tauri+SQLite), управляемая из React.

## What Changes

- **Новый домен `schedule`** — изолированная вкладка «Расписание» (не зависит от `tup/ktp`): CRUD учителей (availability 6×8, baseRoom), классов (смены, подгруппы), кабинетов (тип/вместимость/этаж), предметов (вес СанПиН 1..10, required_room_type, requires_split, related).
- **Матрица нагрузки (Curriculum)**: `Класс × Предмет → Учитель (+второй для split) × Часы/нед` — единственный вход для солвера, валидируется против ТУП.
- **Математическое ядро CP-SAT (OR-Tools, Python)**: декларативная модель `x[i,d,p] ∈ {0,1}` + Hard (H1..H10: сингулярность учителя/класса/кабинета, availability, расщепление синхронно, спецкабинеты, смены) + Soft (S1..S6: окна, изгнание из кабинета, СанПиН-парабола, чередование, миграция, баланс) + `Minimize(Σ w·penalty)`. Вес `0` мгновенно отключает Soft. Время ≤60с (типовая 30×40) / ≤180с (60 классов), `INFEASIBLE` с `diagnostics.infeasible_core`.
- **Единый JSON-контракт `schema_version=1`** (Rust↔Python, stdin/stdout, `schemars`+`pydantic`): `Teachers/Classes/Rooms/Subjects/Curriculum/Weights` → `slots + penalties + solver_stats`.
- **Host-интеграция (Rust, Tauri, tokio)**: `SolverHost` (spawn Python, не блокирует UI), Tauri-команды `schedule_*`, SQLite `schedule_*` (WAL, 0010_schedule.sql), транзакционный коммит с двойной Hard-валидацией.
- **UI (React)**: 5 экранов — Dashboard (готовность, INFEASIBLE-карточка), DataManagement (4 таба), CurriculumMatrix, ConstraintsConfigurator (6 ползунков 0..1000), TimetableGrid (режимы по классу/учителю/кабинету, подсветка окон, график параболы, экспорт XLSX/CSV).

## Capabilities

### New Capabilities
- `schedule`: Генератор расписания — домен, математическое ядро, JSON-контракт и UI вкладки «Расписание».

### Modified Capabilities
- `app-shell`: Расширение `View` на `"schedule"` и `MainLayout` (новый пункт «Расписание»).

## Impact

- `Desktop/src-tauri/migrations/0010_schedule.sql` — новая миграция (7 таблиц `schedule_*`).
- `Desktop/src-tauri/src/domain/schedule/` — доменные типы, newtype ID, валидация.
- `Desktop/src-tauri/src/db/schedule/` — репозитории (sqlx).
- `Desktop/src-tauri/src/infra/solver_host.rs` — управление Python-процессом.
- `Desktop/src-tauri/src/commands/schedule.rs` — Tauri invoke handlers.
- `solver/` — Python пакет (`engine.py`, `schema.py`, `constraints/`, `requirements.txt`).
- `Desktop/src/domains/schedule/` — React домен (SchedulePage, 5 экранов, api, hooks).
- `Desktop/src/App.tsx` — добавление `View="schedule"`.
- `Desktop/src/styles.css` — стили грида/ползунков (токены).
- `docs/schedule/` — 7 документов планирования (источник истины до ревью).

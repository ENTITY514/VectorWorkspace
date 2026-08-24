## 1. Фундамент данных (БД + домены + CRUD)

- [x] 1.1 Создать миграцию `Desktop/src-tauri/migrations/0010_schedule.sql` (7 таблиц `schedule_*`: teachers/rooms/classes/subgroup_rules/subjects/curriculum/weights/slots, CHECK/UNIQUE/FK/индексы, триггер `CHECK_SPLIT_TEACHERS`).
- [x] 1.2 Rust `src/domain/schedule/model.rs` — типы `Teacher/ClassGroup/Room/Subject/CurriculumEntry/Weights/TimeSlot` + newtype ID (`TeacherId` etc.) + `TryFrom` инварианты (`sanitary_weight 1..10`, `hours 1..6`, `availability≥1 true`).
- [x] 1.3 Rust `src/domain/schedule/validation.rs` — `validate_*` с ошибками `InvalidWeight/NoAvailability/SameSplitTeacher`.
- [x] 1.4 Rust `src/db/schedule/{teachers,rooms,classes,subjects,curriculum,weights,slots}.rs` — репозитории (sqlx, SQLite WAL) + тесты DDL (`unique_room_name`, `split_trigger`, `slots_unique_*`, `cascade`).
- [x] 1.5 Tauri-команды `src/commands/schedule.rs` — `schedule_get_state`, `upsert_teacher/room/class/subject`, `set_curriculum`, `set_weights`, `get_slots`, `export` (XLSX/CSV) + `cargo test` зелёный.

## 2. Python-ядро и JSON-контракт

- [x] 2.1 `solver/schema.py` — `pydantic v2` `InputModel/OutputModel` (`schema_version=1`, `Teachers/Classes/Rooms/Subjects/Curriculum/Weights/TimeGrid` → `slots+penalties+solver_stats+diagnostics`), валидация, `requirements.txt` (`ortools==9.10.*`, `pydantic==2.*`).
- [x] 2.2 `solver/engine.py` + `solver/constraints/hard.py` — переменные `x[i,d,p] + y[i,room]` (декомпозиция), Hard H1..H10 (`AddExactlyOne`/`AddAtMostOne`/`Add(x==0)`, split-синхронность `Add(x1==x2)`, спецкабинеты, смены, availability предфильтр).
- [x] 2.3 `solver/__main__.py` — протокол stdin/stdout (JSON), `INVALID_INPUT → exit 2`, логи в stderr, `OutputModel` валидация.
- [x] 2.4 Rust `src/infra/solver_host.rs` — `SolverHost::run` (`tokio::process::Command`, stdin JSON, stdout JSON, stderr → `schedule:log` event, таймаут `time_limit+5s`, `SolverCrashed`/`InvalidContract` ошибки) + `commit_slots` транзакция с `validate_hard()` (Zero-Trust).
- [x] 2.5 Интеграционные тесты `test_solver_host_*` (success/infeasible/crash/timeout) + Python `test_hard_*` (singularity/availability/room_type).

## 3. Soft-ограничения и целевая функция

- [x] 3.1 `solver/constraints/soft.py` — S1 окна (`first/last/windows`), S2 изгнание (`base_room`), S3 СанПиН-парабола (`daily_weight vs ideal+tolerance`), S4 чередование (`related`), S5 миграция (`floor`), S6 баланс (`variance`), `model.Minimize(Σ w·penalty)`, `w=0` ветка удалена.
- [x] 3.2 Поиск: `CpSolver` (`num_search_workers=8`, `max_time_in_seconds`, `random_seed`, `SolutionCallback`), `AddDecisionStrategy` для split-instances.
- [x] 3.3 Тесты Soft: `test_soft_windows_*` (minimized + weight 0 disables), `test_soft_sanpin_*` (parabola + weight 0), `test_soft_alternation`, `test_soft_room_displacement`.
- [x] 3.4 INFEASIBLE-диагностика — эвристика `requested > available` (учителя/кабинеты/смены) + `diagnostics.infeasible_core` (`reason`, `conflicting_entities`, `suggestion`) + тесты `test_boundary_infeasible_*` + `test_infeasible_does_not_crash`.

## 4. UI — изолированная вкладка «Расписание»

- [x] 4.1 `Desktop/src/domains/schedule/types.ts` + `api/scheduleApi.ts` (invoke обёртки) + `hooks/useScheduleState|useScheduleProgress` (Tauri Event `schedule:progress`).
- [x] 4.2 `Desktop/src/domains/schedule/SchedulePage.tsx` — роутер вкладки (5 под-вкладок), `lazy` import, расширение `View="schedule"` в `App.tsx` + `MainLayout` пункт «Расписание» + линтер `no-restricted-imports` (запрет `tup/ktp`).
- [x] 4.3 `components/Dashboard.tsx` — readiness-бар, статус `OPTIMAL/FEASIBLE/INFEASIBLE/TIME_LIMIT`, `solver_stats`, INFEASIBLE-карточка с кликабельными `conflicting_entities`, кнопки Generate/Export/Clear/Demo.
- [x] 4.4 `components/DataManagement.tsx` (4 таба: `TeachersTab` с 6×8 availability-грид, `ClassesTab` с subgroup_rules, `RoomsTab` с room_type фильтр, `SubjectsTab` с sanitary_weight слайдер) — CRUD диалоги, валидация, виртуализация.
- [x] 4.5 `components/CurriculumMatrix.tsx` — таблица `Класс×Предмет → Учитель×Часы` (чипы, поповер `CurriculumCellEditor`, split-два селекта, часы 1..6, валидация против ТУП, «Заполнить из ТУП»).
- [x] 4.6 `components/ConstraintsConfigurator.tsx` — 6 ползунков 0..1000 (window/room/sanpin/alternation/movement/balance) + «Сбросить» + «Сохранить» (`schedule_set_weights`) + бейдж «Отключено» при 0.
- [x] 4.7 `components/TimetableGrid.tsx` — режимы `По классам/учителям/кабинетам` (строки периоды, столбцы дни), фильтры, цвета по `subject_id`, split-диагональ, окна-штриховка, парабола-график (Recharts), `empty/loading/infeasible/done` состояния, `React.memo` на ячейку.
- [x] 4.8 Стили `Desktop/src/styles.css` — `.schedule-grid`, `.availability-matrix`, `.weight-slider` (токены `--bg-*`, `--accent`).

## 5. Тестирование, нагрузка, полировка

- [x] 5.1 Unit Rust — `cargo test` (инварианты, DDL, `test_variable_count_micro`) + `cargo tarpaulin` ≥80%.
- [x] 5.2 Solver Python — `pytest -q solver/tests/` (Hard/Soft/Sanity `test_sanity_split_parallel`/Boundary INFEASIBLE) + `pytest --cov` ≥85% + `test_soft_*_weight_zero_disables` на каждый Soft.
- [x] 5.3 Integration — `test_solver_host_*` + `test_commit_validates_hard` + `pytest --run-load` (micro/small/typical/large, p50/p95 ≤60с/180с, gap≤5%).
- [x] 5.4 E2E (React) — `vitest` (компоненты, empty-state, weight 0 бейдж, INFEASIBLE-карточка) + WebDriver сценарий `CRUD→Curriculum→Weights→Generate→Grid→Export` + демо-данные (школа 20 классов).
- [x] 5.5 Документация пользователя + `docs/schedule/` без TODO + покрытие `vitest --coverage` ≥70%.

## 6. Проверка (Definition of Done)

- [x] 6.1 `npx tsc --noEmit` и `npx vite build` — без ошибок.
- [x] 6.2 `cargo test` + `pytest --cov` + `vitest --coverage` — зелёные, пороги достигнуты.
- [x] 6.3 Демо-школа 30×40 — `OPTIMAL`, 0 Hard, split параллельно, `wall_ms ≤60000`, экспорт XLSX открывается.
- [x] 6.4 INFEASIBLE-школа — `diagnostics.infeasible_core` с `reason` + кликабельные сущности, не краш.
- [x] 6.5 Линт `no-restricted-imports` проходит (изоляция `schedule`).

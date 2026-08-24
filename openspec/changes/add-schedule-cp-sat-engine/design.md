## Context

VectorWorkspace — Tauri v2 (Rust, tokio, sqlx, SQLite WAL) + React/TypeScript. Существующие домены (ТУП/КТП/КСП/СОР) не решают STP. В `openspec/specs/schedule-generator/design.md` обоснован выбор CP-SAT (Google OR-Tools) vs GA/ILP/BruteForce: только CP-SAT даёт декларативные Hard (0 коллизий) + Soft (штрафы) + INFEASIBLE-диагностику + ≤60с на типовой школе без лицензий. `prerequisites.md` зафиксировал необходимость справочников (кабинеты, учителя с availability, классы с подгруппами) и матрицы нагрузки до запуска солвера. Текущая БД (`docs/09-database-schema.md`) не содержит `schedule_*`. Требуется изолированный контур: вкладка «Расписание» не импортирует `tup/ktp`, Python-солвер — отдельный процесс (падение не роняет Tauri).

## Goals / Non-Goals

**Goals:**
- 0 Hard-нарушений в любом `OPTIMAL`/`FEASIBLE` (AC-01).
- Типовая школа 30×40×35 кабинетов ×30 слотов — ≤60с, `OPTIMAL` или `gap≤5%` (AC-02/03).
- INFEASIBLE возвращает `diagnostics.infeasible_core` с `reason + conflicting_entities` (AC-05).
- Расщепление `requires_split` — синхронно в один `T`, разные teacher/room (AC-06).
- Вес `0` мгновенно отключает Soft без пересборки (AC-09).
- Изоляция: линтер запрещает `schedule → tup/ktp` импорты (AC-10).
- Offline-First: OR-Tools без сети, SQLite WAL.

**Non-Goals:**
- Облачная синхронизация расписания, Kundelik API (только экспорт XLSX/CSV).
- Генетические/эвристические альтернативы солверу.
- Автоматические замены/больничные в реальном времени.
- Мобильное приложение.

## Decisions

- **CP-SAT (OR-Tools 9.10, Python)** — Hard через `AddExactlyOne`/`AddAtMostOne`/`Add(x==0)`, Soft через индикаторы + `Minimize(Σ w·penalty)`. Альтернатива `ortools` crate отклонена: сборка C++ на Windows сложна, отставание от Python-релизов.
- **Декомпозиция переменных**: `x[i,d,p] + y[i,room]` вместо `x[i,d,p,room]` чтобы снизить с 1M до ~42K булевых на типовой школе. Предфильтр: не создавать `x` для `availability=False` или `room_type mismatch`.
- **JSON-контракт `schema_version=1`**: Rust `schemars` + Python `pydantic v2`, stdin/stdout (≤120KB вход, ≤50KB выход). Версия инкрементируется при ломающих изменениях. Альтернатива gRPC/WebSocket отклонена: оверхед для локального процесса.
- **SolverHost (tokio::process)**: не блокирует Tauri UI, таймаут `time_limit_sec + 5s grace`, `stderr` → `schedule:log` событие, `exit 2` = `INVALID_INPUT`, иное ≠0 = `SolverCrashed`.
- **Транзакция результата**: Rust `validate_hard()` перед `DELETE+INSERT schedule_slots` в одной `tx` (Zero-Trust: Python никогда не пишет в БД).
- **Веса Soft 0..1000**: `0` = не создавать индикатор, `1..1000` = коэффициент в objective. Дефолты: window 200, room 50, sanpin 100, alternation 80, movement 20, balance 30.
- **СанПиН-парабола**: `ideal[grade][d]` (пик Вт-Ср) + `tolerance=2`, `deviation = max(0, |daily_weight-ideal|-tolerance)`, Soft (не Hard) — при 8 уроках/день идеал недостижим.
- **INFEASIBLE-диагностика**: CP-SAT не даёт IIS; аппроксимация — проверка `requested > available` по учителям/кабинетам/ сменам + `AddAssumptions`-петля (V2).
- **UI-изоляция**: `domains/schedule/` lazy-loaded, `View="schedule"`, 5 экранов (Dashboard, DataManagement 4 таба, CurriculumMatrix, ConstraintsConfigurator 6 ползунков, TimetableGrid 3 режима). Линт `no-restricted-imports`.
- **Миграция 0010_schedule.sql**: 7 таблиц `schedule_*` с CHECK, UNIQUE, FK, индексами; триггер `CHECK_SPLIT_TEACHERS`.

## Risks / Trade-offs

- [Risk] CP-SAT worst-case экспонента → на 60 классах может превысить 180с → Mitigation: `time_limit` + возврат лучшего `FEASIBLE` (gap), `SolutionHint` warm-start, `num_search_workers=8`.
- [Risk] Python не установлен → Mitigation: embed `python-embed` в дистрибутив Tauri, fallback диалог.
- [Risk] СанПиН-парабола конфликтует с другими Soft → Mitigation: Soft (не Hard) + настраиваемый вес.
- [Risk] 42K переменных всё ещё много → Mitigation: предфильтр availability/room_type, `AddExactlyOne` propagation, инкрементальный solve.
- [Risk] INFEASIBLE-диагностика неполна → Mitigation: MVP — эвристика `requested>available`, V2 — `Assumptions` + минимальное ядро.

## Alternatives Considered

- **Genetic Algorithm**: отклонён — нарушает Hard, требует настройки мутаций, не диагностирует INFEASIBLE.
- **ILP (Gurobi/CBC)**: отклонён — лицензия/стоимость, слабее на булевой логике/дизъюнктах.
- **ortools Rust crate**: отклонён — сложность сборки C++.
- **gRPC вместо stdin/stdout**: отклонён — оверхед.

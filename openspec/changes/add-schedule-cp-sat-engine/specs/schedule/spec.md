# Spec: schedule (delta)

## ADDED Requirements

### Requirement: Schedule Domain Isolation

Система SHALL предоставлять изолированный домен `schedule` (вкладка «Расписание») который не импортирует `tup/ktp` напрямую и взаимодействует только через `schedule_*` Tauri API. Линтер SHALL запрещать `schedule → tup/ktp` импорты.

#### Scenario: Isolation lint passes

- **WHEN** в `domains/schedule/` появляется `import from "domains/tup"` — **THEN** линтер `no-restricted-imports` падает.
- **WHEN** вкладка «Расписание» рендерится — **THEN** она не читает `tup_documents`/`ktp_plans` напрямую, только `schedule_*` SQLite.

### Requirement: Schedule Data Management (CRUD)

Система SHALL предоставлять CRUD для 4 справочников с валидацией Code-Enforced Invariants:

- **Teachers**: `full_name` обязателен, `base_room_id` опц. FK, `max_daily_lessons 0..10`, `availability 6×8 bool` где ≥1 `true`, иначе `Err(NoAvailability)`. UI — матрица 6×8 чекбоксов.
- **Rooms**: `name` unique, `room_type ∈ {General,ChemistryLab,PhysicsLab,BiologyLab,Informatics,LanguageLab,Gym,Workshop}`, `capacity>0`, `floor 1..5|null`.
- **Classes**: `grade 1..11`, `letter` non-empty, `headcount>0`, `shift First/Second`, `subgroup_rules` (`subject_id`, `group_count 2|3`).
- **Subjects**: `sanitary_weight 1..10`, `required_room_type|null`, `requires_split bool`, `is_double_allowed bool`, `related_subject_ids []`.

#### Scenario: Teacher availability validation

- **WHEN** сохраняется учитель с `availability=[[false;8];6]` — **THEN** `Err(NoAvailability)` и запись не создаётся.

#### Scenario: Room name uniqueness

- **WHEN** создаётся кабинет с дубликатом `name` — **THEN** `SQLITE_CONSTRAINT` и ошибка в UI.

#### Scenario: Split requires two teachers

- **WHEN** `subject.requires_split=true` и `curriculum.split_teacher2_id IS NULL` — **THEN** `SQLITE_CONSTRAINT` триггера `CHECK_SPLIT_TEACHERS`.

### Requirement: Curriculum Matrix (Load)

Система SHALL предоставлять матрицу `Класс × Предмет → Учитель(+второй для split) × hours_per_week 1..6`. Для `requires_split` требуются два разных учителя. Часы сверяются с ТУП (предупреждение если > `tup.hours`).

#### Scenario: Split curriculum entry

- **WHEN** завуч заполняет ячейку `8А × Английский` (requires_split) — **THEN** UI требует `teacher1 != teacher2`, `hours 1..6`, иначе ошибка.

### Requirement: Weights (Soft Constraints Configurator)

Система SHALL хранить singleton `Weights {window, room_displacement, sanpin_parabola, alternation, movement, load_balance}` каждый `0..1000` (дефолт 200/50/100/80/20/30). `0` SHALL мгновенно отключать соответствующий Soft без пересборки модели (только objective). UI — 6 ползунков + бейдж «Отключено» при 0.

#### Scenario: Weight zero disables soft

- **WHEN** `window=0` и запускается генерация — **THEN** `penalties.window == 0` и окна не влияют на objective; тест `test_soft_windows_weight_zero_disables` проходит.

### Requirement: JSON Contract (Rust ↔ Python)

Система SHALL использовать версионированный JSON-контракт `schema_version=1` (stdin/stdout). Вход: `Teachers/Classes/Rooms/Subjects/Curriculum/Weights/TimeGrid/Meta(time_limit_sec, num_workers, seed)`. Выход: `status ∈ {OPTIMAL,FEASIBLE,INFEASIBLE,TIME_LIMIT}`, `slots[]`, `penalties`, `solver_stats(wall_ms,branches,gap)`, `diagnostics(infeasible_core{reason,conflicting_entities,suggestion})`. Несовпадение `schema_version` → `Err(VersionMismatch)`. Валидация: Rust `schemars` + Python `pydantic v2`; `INVALID_INPUT → exit 2`.

#### Scenario: Contract version mismatch

- **WHEN** Rust отправляет `schema_version=2` а Python знает только `1` — **THEN** Rust получает `Err(VersionMismatch)` до spawn.

### Requirement: CP-SAT Solver — Hard Constraints

Солвер SHALL гарантировать 0 нарушений Hard в `OPTIMAL`/`FEASIBLE`:

- **H1 Единственность**: `∀i Σ_{d,p} x[i,d,p]==1`.
- **H2 Учитель**: `∀u,d,p Σ_{i:teacher=u} x[i,d,p]≤1`.
- **H3 Класс**: `∀c,d,p` не более одного урока (подгруппы отдельно, целый класс блокирует подгруппы).
- **H4 Кабинет**: `∀room,d,p Σ x≤1`.
- **H5 Availability**: `x=0` вне `availability[u][d][p]`.
- **H6 Расщепление**: `x[i1,d,p]==x[i2,d,p]` и `y[i1]!=y[i2]` для `requires_split`.
- **H7 Спецкабинет**: `y[i,room]==0` если `room_type != required_room_type`.
- **H8 Смены**: `x=0` вне `shift_boundaries`.
- **H9 Лимиты**: `Σ_{p} x[u,d,p]≤max_daily_lessons`, `Σ_{p} x[c,d,p]≤max_daily_load[grade]`.
- **H10 Спаренные** (если `is_double_allowed`): `x[i,d,p]==x[i,d,p+1]`.

#### Scenario: Hard teacher singularity

- **WHEN** два класса требуют `t1` в один `T` (1 день×1 период) — **THEN** `INFEASIBLE` с `conflicting_entities` содержащим `t1`.

#### Scenario: Hard split parallel

- **WHEN** `english requires_split` с `petrova+sidorova` — **THEN** `FEASIBLE` содержит 2 слота с одинаковыми `day/period`, разными `room_id/teacher_id/subgroup_label`.

### Requirement: CP-SAT Solver — Soft Constraints & Objective

Солвер SHALL минимизировать `Minimize(Σ w·penalty)` где:

- **S1 Окна**: `windows[u,d]=(last-first+1)-occupied`, `penalty_window=Σ windows`.
- **S2 Изгнание**: `penalty_room=Σ (y[i]!=base_room)`.
- **S3 СанПиН-парабола**: `daily_weight[c,d]=Σ x·sanitary_weight`, `ideal[grade][d]` пик Вт-Ср, `deviation=max(0,|daily-ideal|-tolerance)`, `penalty_sanpin=Σ deviation`.
- **S4 Чередование**: `penalty_alternation=1` если `related` предметы в один день.
- **S5 Миграция**: `move=1` если `floor` меняется между `p` и `p+1`.
- **S6 Баланс**: `variance=Σ (daily_count-avg)^2`.

При `w=0` индикатор не создаётся. Дефолты см. Weights.

#### Scenario: Soft sanpin parabola

- **WHEN** `sanpin_parabola=1000` и предметы `math(9)+pe(2)` — **THEN** `daily_weight` Вт ≥ Пн и Вт ≥ Пт (пик в середине).

### Requirement: SolverHost & Transaction (Rust)

`SolverHost` SHALL спавнить Python через `tokio::process` (не блокируя UI), передавать stdin JSON, читать stdout JSON, логи `stderr → schedule:log` event, таймаут `time_limit+5s`, `exit 2` → `InvalidInput`, иное ≠0 → `SolverCrashed`. После `OPTIMAL`/`FEASIBLE` SHALL валидировать `validate_hard()` и атомарно `DELETE+INSERT schedule_slots` в одной `tx`; при `INFEASIBLE` не коммитить, вернуть `diagnostics.infeasible_core`.

#### Scenario: Solver crash isolation

- **WHEN** Python падает `exit 1` — **THEN** Rust возвращает `Err(SolverCrashed)` и Tauri UI показывает ошибку без падения приложения.

### Requirement: Timetable Grid (UI)

Грид SHALL поддерживать 3 режима (`По классам/учителям/кабинетам`, строки периоды, столбцы дни Пн-Сб), фильтры (класс/учитель/кабинет), цвета по `subject_id`, split-диагональ, подсветку окон (жёлтая штриховка), график параболы (Recharts), состояния `empty/loading/infeasible/done` + бейдж `OPTIMAL` + экспорт XLSX/CSV.

#### Scenario: Grid by class shows lessons

- **WHEN** `c_8a` имеет 3 урока — **THEN** грид «По классам» с фильтром `8А` показывает 3 цветных чипса в правильных `day/period`.

### Requirement: Performance & Infeasible Diagnostics

Типовая школа 30×40×35×30 слотов SHALL решаться `p50≤30с p95≤60с` (`OPTIMAL` или `gap≤5%`), крупная 60×80 — ≤180с. `INFEASIBLE` SHALL возвращать `reason` + `conflicting_entities` (эвристика `requested>available` по учителям/кабинетам). `INFEASIBLE` не SHALL падать.

#### Scenario: Boundary infeasible too many lessons

- **WHEN** 10 уроков в 1 день×8 периодов — **THEN** `INFEASIBLE` с `infeasible_core != null`.

### Requirement: Dashboard

Dashboard SHALL показывать readiness-бар (учителя/классы/кабинеты/нагрузка), статус последнего запуска (`OPTIMAL/FEASIBLE/INFEASIBLE/TIME_LIMIT` + `solver_stats` + разбивка `penalties`), INFEASIBLE-карточку с кликабельными сущностями, кнопки Generate/Export/Clear/Demo и прогресс `schedule:progress`.

#### Scenario: Dashboard infeasible card

- **WHEN** последний запуск `INFEASIBLE` по `t_ivanov` — **THEN** карточка показывает `reason` и ссылку на `t_ivanov` (клик → TeachersTab).

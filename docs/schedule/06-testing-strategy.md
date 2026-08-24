# 06. Стратегия Тестирования — 4 Уровня + INFEASIBLE-Диагностика

> Принцип: каждый Hard — тест, каждый Soft — тест с `weight=0` и `weight>0`, каждый INFEASIBLE — тест с ожиданием краша-диагностики.

## 6.1 Пирамида тестов

```
E2E (Tauri + React) — 5% — 1 сценарий: CRUD → Generate → Grid → Export
  ↑
Integration (Rust ↔ Python JSON) — 15% — контракт, SolverHost, транзакция
  ↑
Solver (Python CP-SAT) — 40% — Hard/Soft, парабола, split, INFEASIBLE
  ↑
Unit (Rust domain/db) — 40% — валидация, CRUD, DDL constraints
```

Запуск: `cargo test` (Rust) + `pytest -q solver/tests/` (Python) + `npm test` (React, Vitest). CI — все три.

## 6.2 Уровень 1 — Unit (Rust, `cargo test`)

### 6.2.1 Доменные инварианты (`domain/schedule/validation.rs`)

| Тест | Вход | Ожидание |
|------|------|----------|
| `test_sanitary_weight_range` | `weight=11` | `Err(InvalidWeight)` |
| `test_availability_at_least_one` | `[[false;8];6]` | `Err(NoAvailability)` |
| `test_split_teachers_distinct` | `teacher1 == teacher2` | `Err(SameSplitTeacher)` |
| `test_hours_per_week_range` | `0`, `7` | `Err(InvalidHours)` |
| `test_weights_zero_allowed` | `window=0` | `Ok` |

### 6.2.2 DDL constraints (`db/schedule/*`)

- `test_unique_room_name` — дубликат `name` → `SQLITE_CONSTRAINT`.
- `test_split_trigger` — `requires_split=1` без `split_teacher2_id` → `SQLITE_CONSTRAINT`.
- `test_slots_unique_teacher_day_period` — два слота одному учителю в один `T` → `SQLITE_CONSTRAINT`.
- `test_foreign_key_cascade` — удаление класса каскадно удаляет `subgroup_rules` и `curriculum`.

### 6.2.3 Генерация переменных (микро-наборы)

Тест `test_variable_generation_micro` (1 класс, 3 учителя, 3 кабинета, 2 дня×3 периода):

```rust
#[test]
fn test_variable_count_micro() {
    let input = micro_input(); // 1 класс × 2 предмета × 3ч = 6 instance, T=6, R=3
    let vars = build_variables(&input);
    assert_eq!(vars.x.len(), 6*6); // 36, т.к. все availability=true
}
```

Проверяет что генерация не паникует и число переменных ожидаемо.

## 6.3 Уровень 2 — Solver (Python, `pytest`, `ortools`)

### 6.3.1 Hard — сингулярность

```python
def test_hard_teacher_singularity():
    inp = make_input(teachers=[t1], classes=[c1,c2], curriculum=[
        (c1, math, t1, 1), (c2, math, t1, 1)
    ], time_grid=1day×1period)
    out = solve(inp)
    assert out["status"] == "INFEASIBLE"  # один учитель не может в один слот два класса
```

### 6.3.2 Hard — availability (фиксированные слоты)

```python
def test_hard_availability_respected():
    t1.availability = [[False]*8, [True]*8, ...]  # только вторник
    inp = make_input(...)
    out = solve(inp)
    for slot in out["slots"]:
        if slot["teacher_id"]==t1.id:
            assert slot["day"]==1
```

### 6.3.3 Hard — спецкабинеты

```python
def test_hard_required_room_type():
    chem = Subject(id="chem", required_room_type="ChemistryLab", ...)
    rooms = [r_general, r_chem_lab]
    out = solve(make_input(subjects=[chem], rooms=rooms))
    for s in out["slots"]:
        if s["subject_id"]=="chem":
            assert rooms_by_id[s["room_id"]].room_type=="ChemistryLab"
```

### 6.3.4 Hard — расщепление (Sanity-подгруппы)

**Обязательный sanity-тест** из ТЗ:

```python
def test_sanity_split_parallel():
    # 8А делится на английский: Петрова + Сидорова, 1 час
    inp = make_input(
        classes=[c_8a],
        subjects=[english(requires_split=True)],
        curriculum=[(c_8a, english, petrova, sidorova, 1)]
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL","FEASIBLE")
    slots = [s for s in out["slots"] if s["subject_id"]=="english"]
    assert len(slots)==2
    assert slots[0]["day"]==slots[1]["day"] and slots[0]["period"]==slots[1]["period"]
    assert slots[0]["room_id"]!=slots[1]["room_id"]
    assert slots[0]["teacher_id"]!=slots[1]["teacher_id"]
    assert slots[0]["subgroup_label"]!=slots[1]["subgroup_label"]
```

Дополнительные split-тесты:
- `test_split_not_same_time_as_whole_class` — в тот же `T` где split-английский, нельзя поставить математику целым классом (Hard H3).
- `test_split_three_groups` — `group_count=3` (редкий кейс).

### 6.3.5 Soft — окна

```python
def test_soft_windows_minimized():
    # Учитель 3 урока, 5 слотов в день — минимум окон =0 (уроки подряд)
    inp = make_input(weights={"window":1000, ...0})
    out = solve(inp)
    # Проверяем что окна действительно 0 при возможности
    assert count_windows(out, teacher=t1, day=0)==0

def test_soft_windows_weight_zero_disables():
    inp0 = make_input(weights={"window":0, ...})
    inp1 = make_input(weights={"window":500, ...})
    out0 = solve(inp0)
    out1 = solve(inp1)
    # out0 может иметь окна, out1 — меньше или равно
    assert count_windows(out1) <= count_windows(out0) + 1  # нестрого из-за других Soft
```

### 6.3.6 Soft — СанПиН-парабола

```python
def test_soft_sanpin_parabola():
    subjects = [math(9), physics(9), pe(2), music(2)]
    inp = make_input(subjects=subjects, weights={"sanpin_parabola":1000})
    out = solve(inp)
    # Проверяем что тяжёлые предметы не в понедельник 1-м уроком массово + пик Вт-Ср
    daily = daily_weights(out, class_id=c_8a.id)
    assert daily[1] >= daily[0]  # Вт >= Пн
    assert daily[1] >= daily[4]  # Вт >= Пт

def test_soft_sanpin_weight_zero():
    inp = make_input(weights={"sanpin_parabola":0})
    out = solve(inp)
    # Не падает, штраф sanpin ==0
    assert out["penalties"]["sanpin_parabola"]==0
```

### 6.3.7 Soft — чередование

```python
def test_soft_alternation_algebra_geometry():
    subjects = [algebra(related=[geometry]), geometry(related=[algebra])]
    inp = make_input(weights={"alternation":1000})
    out = solve(inp)
    # Проверяем что в один день не оба
    for d in range(6):
        day_subjects = subjects_in_day(out, class_id=c_8a.id, day=d)
        assert not ("algebra" in day_subjects and "geometry" in day_subjects)
```

### 6.3.8 Soft — изгнание из кабинета

```python
def test_soft_room_displacement():
    t1.base_room_id = r_42.id
    inp = make_input(weights={"room_displacement":1000})
    out = solve(inp)
    # Если r_42 свободен в тот T — учитель должен быть в нём
    for s in out["slots"]:
        if s["teacher_id"]==t1.id:
            # Если в этот T нет химии (Hard), то room должен быть 42
            # Проверяем что displacement минимален
            pass
```

## 6.4 Уровень 3 — Boundary / INFEASIBLE

### 6.4.1 Boundary — перегрузка слотов

```python
def test_boundary_infeasible_too_many_lessons():
    # 10 уроков в день при 8 периодах и 1 классе — INFEASIBLE по H9 (max 8)
    inp = make_input(
        classes=[c1],
        curriculum=[(c1, subj, t1, 10)],  # 10 часов в неделю, но 1 день × 8 периодов
        time_grid={"days":1, "periods_per_day":8}
    )
    # Но если дней 5, то 10 уроков/5 дней =2/день → FEASIBLE. Делаем 1 день чтобы форсировать.
    out = solve(inp)
    assert out["status"]=="INFEASIBLE"
    assert "infeasible_core" in out["diagnostics"]
    assert out["diagnostics"]["infeasible_core"] is not None
```

### 6.4.2 Boundary — нехватка кабинетов спецтипа

```python
def test_boundary_infeasible_chemistry_rooms():
    # 3 класса одновременно требуют химию, но химикабинетов только 1
    # При 1 слоте → INFEASIBLE по H4+H7
    inp = make_input(
        subjects=[chem(required_room_type="ChemistryLab")],
        rooms=[r_chem1],  # только 1
        curriculum=[(c1,chem,t1,1),(c2,chem,t2,1),(c3,chem,t3,1)],
        time_grid={"days":1,"periods_per_day":1}
    )
    out = solve(inp)
    assert out["status"]=="INFEASIBLE"
```

### 6.4.3 Boundary — availability =0

```python
def test_boundary_infeasible_availability_zero():
    t1.availability = [[False]*8]*6
    inp = make_input(teachers=[t1], curriculum=[(c1,math,t1,1)])
    out = solve(inp)
    assert out["status"]=="INFEASIBLE"
    assert "t1" in out["diagnostics"]["infeasible_core"]["conflicting_entities"]
```

### 6.4.4 Проверка что INFEASIBLE не падает

```python
def test_infeasible_does_not_crash():
    # Любой INFEASIBLE должен вернуть JSON, а не exception
    for inp in infeasible_inputs():
        out = solve(inp)
        assert out["status"]=="INFEASIBLE"
        assert isinstance(out["diagnostics"]["infeasible_core"]["reason"], str)
```

## 6.5 Уровень 4 — Integration (Rust ↔ Python)

```rust
#[tokio::test]
async fn test_solver_host_success() {
    let host = SolverHost::new(mock_python_success());
    let input = ScheduleInput::demo();
    let out = host.run(input).await.unwrap();
    assert!(out.status == "OPTIMAL" || out.status == "FEASIBLE");
    assert!(!out.slots.is_empty());
}

#[tokio::test]
async fn test_solver_host_infeasible() {
    let host = SolverHost::new(mock_python_infeasible());
    let out = host.run(infeasible_input()).await.unwrap();
    assert_eq!(out.status, "INFEASIBLE");
    assert!(out.diagnostics.infeasible_core.is_some());
}

#[tokio::test]
async fn test_solver_host_crash() {
    let host = SolverHost::new(mock_python_crash()); // exit 1
    let err = host.run(input).await.unwrap_err();
    assert!(matches!(err, SolverError::Crashed(_)));
}

#[tokio::test]
async fn test_commit_validates_hard() {
    // Подменяем Python чтобы вернул слот с коллизией учителя
    let bad_output = ScheduleOutput { slots: vec![slot1, slot1_dup], .. };
    let err = commit_slots(&pool, bad_output).await.unwrap_err();
    assert!(err.to_string().contains("teacher singularity"));
}
```

## 6.6 Уровень 5 — E2E (React + Tauri)

- **Сценарий**: Заполнить справочники (2 учителя, 1 класс, 2 кабинета, 2 предмета) → Заполнить Curriculum (3 часа) → Установить веса → Нажать Generate → Дождаться `OPTIMAL` → Проверить что Grid показывает 3 урока без окон → Экспорт XLSX → Проверить что файл создался и содержит 3 строки.
- Инструмент: `WebDriver` (Tauri) + `Vitest` + `msw` для мока invoke в dev.

## 6.7 Нагрузочные тесты

| Школа | Классов | Учителей | Instance | Время (цель) | Статус |
|-------|---------|----------|----------|--------------|--------|
| Микро | 1 | 3 | 10 | < 1 сек | OPTIMAL |
| Малая | 10 | 15 | 150 | < 5 сек | OPTIMAL |
| Типовая | 30 | 40 | 550 | < 60 сек | OPTIMAL/FEASIBLE |
| Крупная | 60 | 80 | 1100 | < 180 сек | FEASIBLE (gap ≤5%) |

Запускаются как `pytest --run-load` (маркер `slow`).

## 6.8 Покрытие

- Rust: `cargo tarpaulin --out Html` → ≥ 80% для `domain/schedule`, `db/schedule`.
- Python: `pytest --cov=solver --cov-report=html` → ≥ 85% для `engine.py`, `constraints/`.
- React: `vitest --coverage` → ≥ 70% для `domains/schedule`.

## 6.9 Чек-лист готовности тестирования

- [ ] Все Hard-тесты зелёные на `micro` и `typical`.
- [ ] Sanity `test_sanity_split_parallel` зелёный (критично).
- [ ] Все `INFEASIBLE` тесты возвращают `diagnostics.infeasible_core` без паники.
- [ ] `weight=0` действительно отключает Soft (проверено на каждом Soft).
- [ ] Нагрузочный типовой <60 сек на CI-раннере (4 ядра).

# 03. Математическая Модель — Переменные, Hard/Soft, Целевая Функция

> Ядро: `solver/engine.py` (Python 3.10+, `ortools==9.10.*`, `pydantic==2.*`). Парадигма: декларативная, без эвристик.

## 3.1 Индексация и переменные

### 3.1.1 Расширение instance

Каждый `CurriculumEntry` с `hours_per_week = h` разворачивается в `h` **lesson instances** (атомарных уроков). Для `requires_split=false`:

```
instance i = (class_id, subject_id, teacher_id, group=None, instance_idx ∈ [0..h-1])
```

Для `requires_split=true` (например, английский 8А, 3 часа → 3 слота × 2 подгруппы = 6 instance, но связанных):

```
split_group = { i_1: (c, s, teacher_A, label="1гр"), i_2: (c, s, teacher_B, label="2гр") }
оба обязаны в один T, но разные room.
```

Всего `N ≈ Σ h` (обычно 500-700 на школу 30 классов). Это на порядок меньше чем `class×subject×teacher×room×T`.

### 3.1.2 Булевы переменные

```python
# Для каждого instance i и каждого T=(d,p) где availability[teacher][d][p]=True
# и room совместим (если required_room_type)
x[i, d, p] ∈ {0,1}  # instance i назначен в слот (d,p)
# Отдельно — назначение кабинета (если не split, иначе фиксировано на room-пул)
r[i, room_id] ∈ {0,1}  # опционально, или моделируем как x[i,d,p,room] если |R| мало
```

Оптимизация: вместо `x[i,d,p,room]` (N×T×R до 1M) используем декомпозицию:

```python
x[i,d,p]  # слот
y[i,room] # кабинет (один на instance, не зависит от дня)
# Связь: если x[i,d,p]=1 то y[i,room] должен быть свободен в (d,p) — через Channeling
```

Для простоты MVP можно оставить `x[i,d,p,room]` если |R|≤15, но для 35 кабинетов — декомпозиция обязательна.

Дополнительно для `is_double_allowed`:
```python
is_double[i]  # булева: этот instance — спаренный (2 периода подряд)
# Требует x[i,d,p]=1 ∧ x[i,d,p+1]=1 ∧ y одинаков
```

### 3.1.3 Вспомогательные переменные для Soft

```python
# Окна учителя
first[u,d], last[u,d] ∈ [0..P-1] ∪ { -1: нет уроков }
windows[u,d] ∈ [0..P]

# СанПиН-отклонение
daily_weight[c,d] = Σ (x[c,s,g,d,p] * sanitary_weight[s])
parabola_deviation[c,d] = |daily_weight[c,d] - ideal_parabola[grade][d]|
```

## 3.2 Hard Constraints (нарушение = INFEASIBLE)

### H1. Единственность instance

```
∀i: Σ_{d,p} x[i,d,p] == 1
```
Каждый урок ровно один раз в неделю. Реализация: `model.AddExactlyOne(x[i,d,p] for d,p)`.

### H2. Сингулярность учителя

```
∀u,d,p: Σ_{i: teacher(i)=u} x[i,d,p] ≤ 1
```
`AddAtMostOne`. Учитель не клонируется.

### H3. Сингулярность класса (с учётом подгрупп)

```
∀c,d,p: Σ_{i: class(i)=c ∧ group(i)=None} x[i,d,p] ≤ 1
∀c,d,p: Σ_{i: class(i)=c ∧ group(i)="1гр"} x[i,d,p] ≤ 1  // подгруппы отдельно
∀c,d,p: NOT (целый класс и подгруппа одновременно) — целый класс блокирует обе подгруппы
```
Для split: если класс делится по английскому, в тот же `T` нельзя ставить математику целым классом (т.к. класс занят). Формализация через `class_busy[c,d,p] = OR(x[i,d,p] for i in class c)`.

### H4. Сингулярность кабинета

```
∀room,d,p: Σ_{i: y[i,room]=1 ∧ x[i,d,p]=1} ≤ 1
```
Если используем `x[i,d,p,room]` → `∀room,d,p: Σ_i x[i,d,p,room] ≤ 1`. Иначе channeling через `y`.

### H5. Фиксированные слоты (Availability)

```
∀i,d,p: if not availability[teacher(i)][d][p]: x[i,d,p] == 0
```
Реализуется генерацией переменных только для `available=True`, либо `Add(x==0)`.

### H6. Расщепление (Split) — синхронность

```
∀c,s где requires_split=true, ∀instance_idx k, ∀d,p:
  x[i_1(k), d, p] == x[i_2(k), d, p]   // обе подгруппы в один слот
  y[i_1(k), room] != y[i_2(k), room]    // разные кабинеты (и учителя уже разные)
```
Реализация: `Add(x1 == x2)` для каждого `(d,p)`. Дополнительно `Add(y1 != y2)` через `Add(y1[room] + y2[room] ≤ 1)`.

### H7. Специфика кабинета

```
∀i где required_room_type[s] != None, ∀room где room_type[room] != required: y[i,room]==0
```
Пул ограничивается при генерации.

### H8. Смены

```
∀c где shift=First, ∀d,p ∈ SecondOnly: x[i∈c,d,p]==0
```
Аналогично availability, но на уровне класса.

### H9. Лимит уроков в день (если max_daily_lessons >0, или СанПиН-лимит)

```
∀u,d: Σ_{i: teacher(i)=u, p} x[i,d,p] ≤ max_daily_lessons[u]
∀c,d: Σ_{i: class(i)=c, p} x[i,d,p] ≤ max_daily_load[grade]  // напр. 6 для 8кл по СанПиН
```

### H10. Спаренные уроки (если задействованы)

```
∀i где is_double: ∃p: x[i,d,p]=1 ∧ x[i,d,p+1]=1 ∧ y[i] одинаков ∧ ¬∃p'≠p,p+1 x[i,d,p']=1
```
Моделируется через `Add(x[i,d,p] == x[i,d,p+1])` + `Add(Σ_p x[i,d,p]==2)` + запрет разрыва.

## 3.3 Soft Constraints и целевая функция

Каждое Soft — булев индикатор нарушения `penalty_*` + вес `w`. Если `w=0`, индикатор не создаётся (ветка удалена).

### S1. Окна учителей (Penalty_Window, w_window)

```
Для каждого u,d где есть хотя бы 2 урока:
  first[u,d] = min{ p | ∃i: teacher(i)=u ∧ x[i,d,p]=1 }
  last[u,d]  = max{ p | ∃i: teacher(i)=u ∧ x[i,d,p]=1 }
  occupied = Σ_p busy[u,d,p]  // busy = OR(x[i,d,p])
  windows[u,d] = (last - first + 1) - occupied   // пустые слоты внутри
  penalty_window = Σ_{u,d} windows[u,d]
```
Реализация CP-SAT: `AddMaxEquality`, `AddMinEquality` через вспомогательные `first/last`, либо линеаризация через `Add(windows >= last-first+1-occupied)`.

Штраф: `w_window * penalty_window` (дефолт 200/окно). Пример: учитель 3 урока с разбросом 5 → 2 окна → 400 штрафа.

### S2. Изгнание из кабинета (Penalty_RoomDisplacement, w_room)

```
penalty_room = Σ_i (1 - y[i, base_room[teacher(i)]])  // если base_room определён
             // но только если base_room не занят в этот T спецпредметом (Hard уже учтён)
```
Если `base_room` — химия и в этот `T` химия занята, штраф не начисляется (естественное вытеснение). Реализация: `Add(penalty_room_i == 1).OnlyEnforceIf(y[i,base]!=1)`.

### S3. СанПиН-парабола (Penalty_SanPin, w_sanpin)

Идеальная парабола для 5-дневки (пример для 8 кл, сумма весов ~ 45/нед):

```
ideal[grade][d] = {Пн: 7, Вт: 11, Ср: 11, Чт: 9, Пт: 7, Сб: 5} // пик Вт-Ср
tolerance = 2
daily_weight[c,d] = Σ_{i∈c, p} x[i,d,p] * sanitary_weight[subject(i)]
deviation[c,d] = max(0, |daily_weight[c,d] - ideal[d]| - tolerance)
penalty_sanpin = Σ_{c,d} deviation[c,d]
```

Штраф: `w_sanpin * penalty_sanpin` (дефолт 100/балл отклонения). Вес `0` → парабола игнорируется.

Альтернатива (упрощённая): штраф за каждый `daily_weight > ideal_max`.

### S4. Чередование (Penalty_Alternation, w_alter)

```
Для каждой пары related (алгебра, геометрия):
  ∀c,d: Σ_{i: subject∈{alg,geom}} x[i,d,p] ≤ 1  // не в один день (мягко)
  penalty_alternation[c,d] = 1 если оба в один день
```
Или последовательность: `день(алгебра) < день(геометрия)` — штраф если нарушено.

### S5. Миграция (Penalty_Movement, w_move)

```
Если учитель в p и p+1 в разных кабинетах на разных этажах:
  move[u,d,p] = 1 если y[i,room1]≠y[j,room2] ∧ floor(room1)≠floor(room2) ∧ x[i,d,p]=1 ∧ x[j,d,p+1]=1
  penalty_move = Σ move
```

### S6. Баланс нагрузки (Penalty_LoadBalance, w_balance)

```
avg = Σ_d daily_count[c,d] / |D|
variance = Σ_d (daily_count[c,d] - avg)^2
penalty_balance = variance  // минимизируем дисперсию
```

### Итоговая целевая

```
Minimize(
    w_window * penalty_window
  + w_room   * penalty_room
  + w_sanpin * penalty_sanpin
  + w_alter  * penalty_alternation
  + w_move   * penalty_movement
  + w_bal    * penalty_balance
)
```

Все `w` из `Weights` (0..1000). Нормализация: веса — безразмерные, солвер минимизирует сумму. При `w=0` член исчезает.

## 3.4 Стратегия поиска

```python
model = cp_model.CpModel()
# ... добавляем H1..H10, S1..S6 ...
solver = cp_model.CpSolver()
solver.parameters.num_search_workers = 8
solver.parameters.max_time_in_seconds = time_limit_sec  # из JSON
solver.parameters.random_seed = seed
solver.parameters.log_search_progress = False
# Приоритет: сначала назначаем split-предметы (наиболее constrained)
for i in split_instances:
    model.AddDecisionStrategy([x[i,d,p] for d,p], cp_model.CHOOSE_FIRST, cp_model.SELECT_MAX_VALUE)
```

Используем `CpSolver.Solve` с `SolutionCallback` для логирования лучшего `FEASIBLE` если `OPTIMAL` не достигнут.

## 3.5 INFEASIBLE-диагностика

CP-SAT не даёт IIS напрямую, но можно аппроксимировать:

1. Пробуем `Solve` → `INFEASIBLE`.
2. Запускаем `AddAssumptions`-петлю: по очереди расслабляем группы Hard (учитель, кабинет, смена) и смотрим что делает задачу FEASIBLE.
3. Формируем `conflicting_entities` — минимальный набор где `Σ hours > Σ slots`.

Эвристика для MVP:

```python
for teacher in teachers:
    requested = sum(e.hours_per_week for e in curriculum if e.teacher_id==teacher.id)
    available = sum(availability[teacher][d][p] for d,p)
    if requested > available:
        core.append(f"Teacher {teacher.id}: {requested} > {available}")
```

Аналогично для кабинетов спецтипа, смен.

## 3.6 Сложность и масштабирование

- Переменных: `N≈600, T≈36 → 21_600 x-переменных` + `y≈600×35=21_000` → ~42K булевых + ~200 вспомогательных.
- Ограничений Hard: ~ N + |U|×T + |R|×T + split ≈ 5_000.
- Soft: ~ |U|×D + |C|×D ≈ 500.

CP-SAT на таком размере: 5-30 сек (8 ядер). При 60 классах (N≈1200) → ~85K переменных, 60-180 сек.

Оптимизации:
- Предфильтр: не создавать `x[i,d,p]` для `availability=False` или `room_type mismatch`.
- `AddExactlyOne` вместо `Add(sum==1)` — быстрее propagation.
- Инкрементальный solve: при изменении одного веса — warm start из предыдущего решения (`SolutionHint`).

## 3.7 Псевдокод ядра

```python
def solve(input_json: dict) -> dict:
    m = InputModel.model_validate(input_json)
    model = cp_model.CpModel()
    x, y = create_variables(model, m)
    add_hard_constraints(model, x, y, m)
    penalties = add_soft_constraints(model, x, y, m)  # dict name->var
    model.Minimize(sum(m.weights[w] * penalties[w] for w in penalties if m.weights[w]>0))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = m.meta.time_limit_sec
    status = solver.Solve(model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return build_feasible_response(solver, x, y, penalties, status)
    else:
        return build_infeasible_response(m)
```

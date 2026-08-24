## Purpose

Локализация модуля «Расписание» — все лейблы, типы, статусыsolver, типыкомнат, смены и технические термины отображаются на русском языке для целевой аудитории (педагоги).

## ADDED Requirements

### Requirement: Localized Solver Status Labels

Система SHALL отображать статусыsolver на русском языке: `OPTIMAL` → «Оптимально», `FEASIBLE` → «Решаемо», `INFEASIBLE` → «Невозможно», `TIME_LIMIT` → «Превышено время», `INVALID_INPUT` → «Ошибка данных».

#### Scenario: Infeasible status displayed in Russian

- **WHEN** солвер возвращает `status: "INFEASIBLE"` — **THEN** UI показывает «Невозможно» вместо «INFEASIBLE».

#### Scenario: Optimal status displayed in Russian

- **WHEN** солвер возвращает `status: "OPTIMAL"` — **THEN** UI показывает «Оптимально».

### Requirement: Localized Room Type Labels

Система SHALL отображать типыкабинетов на русском: `General` → «Общий», `ChemistryLab` → «Хим. лаборатория», `PhysicsLab` → «Физ. лаборатория», `BiologyLab` → «Биол. лаборатория», `Informatics` → «Информатика», `LanguageLab` → «Языковой кабинет», `Gym` → «Спортзал», `Workshop` → «Мастерская».

#### Scenario: Room type shown in Russian in room list

- **WHEN** кабинет имеет `room_type: "ChemistryLab"` — **THEN** в списке кабинетов отображается «Хим. лаборатория».

### Requirement: Localized Shift Labels

Система SHALL отображать смены на русском: `First` → «Первая», `Second` → «Вторая».

#### Scenario: Shift displayed in class card

- **WHEN** класс имеет `shift: "Second"` — **THEN** в карточке класса отображается «Вторая смена».

### Requirement: Localized Technical Terms

Система SHALL заменять технические термины:

- `V2` → «Скоро» (в контексте будущих функций)
- `CP-SAT` → «Алгоритм» (при упоминании метода решения)
- `BaseRoom` → «Основной кабинет»
- `split` → «Деление» (в контексте split-уроков)
- `Legacy` → «Импортированное» (вкладка и данные)
- `Benchmark` → «Сравнение» (вкладка)
- `max` → «Макс. уроков/день» (в контексте учителя)

#### Scenario: Legacy tab label in Russian

- **WHEN** пользователь видит вкладку — **THEN** она отображается как «Импортированное», а не «Легаси».

### Requirement: Localized Field Names in Filters

Система SHALL отображать имена полей на русском: `class_id` → «Класс», `teacher_id` → «Учитель`, `room_id` → «Кабинет`, `subject_id` → «Предмет».

#### Scenario: Filter placeholder in Russian

- **WHEN** пользователь видит поле фильтра — **THEN** placeholder содержит «Класс / Учитель / Кабинет» вместо «class_id / teacher_id / room_id».

### Requirement: Localized Grid Cell Content

Система SHALL отображать содержимое ячеек грида на русском: название предмета (а не `subject_id`), ФИО учителя (обрезанный), название кабинета (обрезанный).

#### Scenario: Grid chip shows subject name

- **WHEN** слот содержит `subject_id: "math"` и предмет имеет `name: "Математика"` — **THEN** в ячейке грида отображается «Математика», а не «math».

### Requirement: Localized Infeasible Diagnostics

Система SHALL отображать диагностику INFEASIBLE на русском: `reason` переводится, `conflicting_entities` показываются с русскими названиями типов («Учитель», «Кабинет», «Класс»).

#### Scenario: Infeasible reason in Russian

- **WHEN** `reason: "teacher_unavailable"` — **THEN** UI показывает «Учитель недоступен в это время».

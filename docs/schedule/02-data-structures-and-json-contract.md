# 02. Структуры Данных и Единый JSON-Контракт

> Заменяет и расширяет `docs/09-database-schema.md` и `docs/14-data-types-and-schemas.md` для домена `schedule`.

## 2.1 Доменные типы (Rust, `src/domain/schedule/`)

```rust
// src/domain/ids.rs — расширяется
pub struct TeacherId(String);   // UUID v4
pub struct ClassId(String);
pub struct RoomId(String);
pub struct SubjectId(String);   // slug: "algebra", "informatika"
pub struct LessonInstanceId(String);

// src/domain/schedule/model.rs
pub enum RoomType {
    General,          // обычный лекционный
    ChemistryLab,     // химия
    PhysicsLab,
    BiologyLab,
    Informatics,      // requires_split=true по умолчанию
    LanguageLab,      // лингвокабинет
    Gym,              // спортзал
    Workshop,         // технология
}

pub enum Shift { First, Second }

pub struct Teacher {
    pub id: TeacherId,
    pub full_name: String,
    pub base_room_id: Option<RoomId>,       // Soft-предпочтение
    pub max_daily_lessons: u8,              // 0 = без лимита, иначе Hard ≤
    pub availability: AvailabilityMatrix,   // 6×8 bool, false = Hard запрет
}

pub struct AvailabilityMatrix(pub [[bool; 8]; 6]); // [day][period]

pub struct ClassGroup {
    pub id: ClassId,
    pub grade: u8,                          // 1..11 (РК)
    pub letter: String,                     // "А", "Б"
    pub headcount: u16,
    pub shift: Shift,
    pub subgroups: Vec<SubgroupRule>,       // правила деления
}

pub struct SubgroupRule {
    pub subject_id: SubjectId,
    pub group_count: u8,                    // 2 (иногда 3)
    pub group_labels: Vec<String>,          // ["1гр", "2гр"]
}

pub struct Room {
    pub id: RoomId,
    pub name: String,                       // "Каб. 42"
    pub room_type: RoomType,
    pub capacity: u16,
    pub base_teacher_id: Option<TeacherId>,
    pub floor: Option<u8>,                  // для штрафа миграции (опц.)
}

pub struct Subject {
    pub id: SubjectId,
    pub name: String,
    pub sanitary_weight: u8,                // 1..10 по СанПиН (ҚР ДСМ-76)
    pub required_room_type: Option<RoomType>, // Hard: только этот пул
    pub requires_split: bool,               // Hard: расщепление
    pub is_double_allowed: bool,            // спаренные уроки (технология)
    pub related_subject_ids: Vec<SubjectId>, // для чередования (алгебра↔геометрия)
}

pub struct CurriculumEntry {
    pub class_id: ClassId,
    pub subject_id: SubjectId,
    pub teacher_id: TeacherId,              // основной учитель (для non-split)
    pub split_teachers: Option<(TeacherId, TeacherId)>, // если requires_split
    pub hours_per_week: u8,                 // из ТУП, 1..6
    pub hours_per_year: Option<u16>,
}

pub struct Weights {
    pub window: u32,            // 0 = откл, иначе 1..1000 (дефолт 200)
    pub room_displacement: u32, // дефолт 50
    pub sanpin_parabola: u32,   // дефолт 100
    pub alternation: u32,       // дефолт 80
    pub movement: u32,          // миграция между этажами, дефолт 20
    pub load_balance: u32,      // дисперсия уроков/день, дефолт 30
}

pub struct TimeSlot { pub day: u8, pub period: u8 } // 0-indexed
```

Инварианты Rust (newtype + `TryFrom`):
- `sanitary_weight ∈ [1,10]`, иначе `Err(InvalidWeight)`.
- `hours_per_week ∈ [1,6]`, `grade ∈ [1,11]`.
- `AvailabilityMatrix` хотя бы один `true`, иначе учитель никогда не доступен → `Err(NoAvailability)`.

## 2.2 SQLite DDL (миграция `0010_schedule.sql`)

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Справочники
CREATE TABLE schedule_teachers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    base_room_id TEXT REFERENCES schedule_rooms(id) ON DELETE SET NULL,
    max_daily_lessons INTEGER NOT NULL DEFAULT 0 CHECK (max_daily_lessons BETWEEN 0 AND 10),
    availability_json TEXT NOT NULL -- JSON [[bool;8];6], валидируется в Rust
);

CREATE TABLE schedule_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    room_type TEXT NOT NULL CHECK (room_type IN ('General','ChemistryLab','PhysicsLab','BiologyLab','Informatics','LanguageLab','Gym','Workshop')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    base_teacher_id TEXT REFERENCES schedule_teachers(id) ON DELETE SET NULL,
    floor INTEGER CHECK (floor BETWEEN 1 AND 5)
);

CREATE TABLE schedule_classes (
    id TEXT PRIMARY KEY,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 11),
    letter TEXT NOT NULL,
    headcount INTEGER NOT NULL CHECK (headcount > 0),
    shift TEXT NOT NULL CHECK (shift IN ('First','Second')),
    UNIQUE (grade, letter)
);

CREATE TABLE schedule_subgroup_rules (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    group_count INTEGER NOT NULL CHECK (group_count IN (2,3)),
    UNIQUE (class_id, subject_id)
);

CREATE TABLE schedule_subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sanitary_weight INTEGER NOT NULL CHECK (sanitary_weight BETWEEN 1 AND 10),
    required_room_type TEXT CHECK (required_room_type IN ('General','ChemistryLab','PhysicsLab','BiologyLab','Informatics','LanguageLab','Gym','Workshop')),
    requires_split INTEGER NOT NULL DEFAULT 0 CHECK (requires_split IN (0,1)),
    is_double_allowed INTEGER NOT NULL DEFAULT 0,
    related_subjects_json TEXT NOT NULL DEFAULT '[]' -- JSON [subject_id]
);

-- Матрица нагрузки (Curriculum)
CREATE TABLE schedule_curriculum (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    split_teacher2_id TEXT REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    hours_per_week INTEGER NOT NULL CHECK (hours_per_week BETWEEN 1 AND 6),
    UNIQUE (class_id, subject_id)
    -- CHECK: если subject.requires_split=1 то split_teacher2_id NOT NULL
);

-- Веса Soft-ограничений (одна строка, singleton)
CREATE TABLE schedule_weights (
    id TEXT PRIMARY KEY DEFAULT 'default',
    window INTEGER NOT NULL DEFAULT 200,
    room_displacement INTEGER NOT NULL DEFAULT 50,
    sanpin_parabola INTEGER NOT NULL DEFAULT 100,
    alternation INTEGER NOT NULL DEFAULT 80,
    movement INTEGER NOT NULL DEFAULT 20,
    load_balance INTEGER NOT NULL DEFAULT 30,
    CHECK (window BETWEEN 0 AND 1000)
);

-- Результат расписания (перезаписывается при каждом solve)
CREATE TABLE schedule_slots (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    room_id TEXT NOT NULL REFERENCES schedule_rooms(id) ON DELETE RESTRICT,
    subgroup_label TEXT, -- NULL = целый класс, "1гр"/"2гр" для split
    day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 5),
    period INTEGER NOT NULL CHECK (period BETWEEN 0 AND 7),
    is_double INTEGER NOT NULL DEFAULT 0,
    UNIQUE (class_id, day, period, subgroup_label),
    UNIQUE (teacher_id, day, period),
    UNIQUE (room_id, day, period)
);
CREATE INDEX idx_slots_class_day ON schedule_slots(class_id, day);
CREATE INDEX idx_slots_teacher_day ON schedule_slots(teacher_id, day);
```

Триггеры/валидация:
- `schedule_curriculum` — триггер `CHECK_SPLIT_TEACHERS`: если `schedule_subjects.requires_split=1` для данного `subject_id`, то `split_teacher2_id IS NOT NULL` и `teacher_id != split_teacher2_id`.
- `schedule_slots` — уникальности уже кодируют Hard-сингулярность; вставка нарушения → `SQLITE_CONSTRAINT`.

## 2.3 Единый JSON-Контракт (Rust ↔ Python)

Версионирование: поле `schema_version: 1`. Ломающие изменения → инкремент + миграция.

### 2.3.1 Входной JSON (Rust → Python, stdin)

```json
{
  "schema_version": 1,
  "meta": { "school_name": "КГУ ОШ №42", "generated_at": "2026-08-24T10:00:00Z", "time_limit_sec": 60, "num_workers": 8, "random_seed": 42 },
  "time_grid": { "days": 6, "periods_per_day": 7, "shift_boundaries": { "First": [0,1,2,3,4,5,6], "Second": [3,4,5,6,7] } },
  "teachers": [
    { "id": "t_ivanov", "full_name": "Иванов И.И.", "base_room_id": "r_42", "max_daily_lessons": 6, "availability": [[true,true,true,true,true,false,false,false],[],[],[],[],[]] }
  ],
  "classes": [
    { "id": "c_8a", "grade": 8, "letter": "А", "headcount": 28, "shift": "First", "subgroups": [{ "subject_id": "english", "group_count": 2 }] }
  ],
  "rooms": [
    { "id": "r_42", "name": "Каб. 42", "room_type": "ChemistryLab", "capacity": 30, "floor": 2 }
  ],
  "subjects": [
    { "id": "algebra", "name": "Алгебра", "sanitary_weight": 9, "required_room_type": null, "requires_split": false, "is_double_allowed": false, "related_subject_ids": ["geometry"] },
    { "id": "informatics", "name": "Информатика", "sanitary_weight": 7, "required_room_type": "Informatics", "requires_split": true, "is_double_allowed": false, "related_subject_ids": [] }
  ],
  "curriculum": [
    { "class_id": "c_8a", "subject_id": "algebra", "teacher_id": "t_ivanov", "split_teacher2_id": null, "hours_per_week": 3 },
    { "class_id": "c_8a", "subject_id": "english", "teacher_id": "t_petrova", "split_teacher2_id": "t_sidorova", "hours_per_week": 3 }
  ],
  "weights": { "window": 200, "room_displacement": 50, "sanpin_parabola": 100, "alternation": 80, "movement": 20, "load_balance": 30 }
}
```

Правила:
- `availability[day][period] = false` → солвер обязан `x=0` (Hard).
- `requires_split=true` → `curriculum` содержит оба учителя; солвер создаёт 2 instance на один `T`.
- `required_room_type != null` → `x[room_type != required] = 0` (Hard).
- Любой `weights.* = 0` → соответствующий Soft-индикатор не создаётся.

### 2.3.2 Выходной JSON (Python → Rust, stdout)

```json
{
  "schema_version": 1,
  "status": "OPTIMAL | FEASIBLE | INFEASIBLE | TIME_LIMIT",
  "solver_stats": { "wall_ms": 23456, "branches": 123456, "conflicts": 7890, "gap_percent": 0.0, "objective_value": 1230 },
  "penalties": { "window": 400, "room_displacement": 150, "sanpin_parabola": 480, "alternation": 80, "movement": 40, "load_balance": 80, "total": 1230 },
  "slots": [
    { "class_id": "c_8a", "subject_id": "algebra", "teacher_id": "t_ivanov", "room_id": "r_12", "subgroup_label": null, "day": 1, "period": 2 },
    { "class_id": "c_8a", "subject_id": "english", "teacher_id": "t_petrova", "room_id": "r_lang1", "subgroup_label": "1гр", "day": 1, "period": 3 },
    { "class_id": "c_8a", "subject_id": "english", "teacher_id": "t_sidorova", "room_id": "r_lang2", "subgroup_label": "2гр", "day": 1, "period": 3 }
  ],
  "diagnostics": {
    "infeasible_core": null,
    "warnings": ["Класс 8А: вторник перегружен (сумма весов 42 > параболы 35)"]
  }
}
```

При `INFEASIBLE`:

```json
{
  "status": "INFEASIBLE",
  "slots": [],
  "diagnostics": {
    "infeasible_core": {
      "reason": "Teacher t_ivanov: 22 hours requested but only 18 available slots (availability 3 days × 6 periods)",
      "conflicting_entities": ["t_ivanov", "c_8a:algebra", "c_9b:algebra"],
      "suggestion": "Расширьте availability t_ivanov или снизьте часы"
    }
  }
}
```

### 2.3.3 Валидация

- **Rust** (`schemars` + `serde`): `JsonContract::validate()` перед `Command::spawn`; при ошибке — не запускать солвер, вернуть `Err(InvalidContract)`.
- **Python** (`pydantic v2`): `InputModel.model_validate_json(stdin)`; при ошибке — `{"status":"INVALID_INPUT", "error": "..."}` на stderr + exit 2 (Rust ловит).
- **Версия**: несовпадение `schema_version` → `Err(VersionMismatch)` с подсказкой обновить.

## 2.4 Связь с существующими типами Vector

- `TeacherId` расширяет `TeacherProfile.id` (но отдельный домен — расписание не зависит от КТП).
- `SubjectId` маппится на `tup_documents.subject_id` для автозаполнения `sanitary_weight` (справочник весов).
- `ClassGroup` (из `types.ts:ClassGroup`) расширяется полями `headcount`, `subgroups`.

## 2.5 Масштабируемость

- Переменных: `|Instances| × |T| × |R|` — в наивной модели до 600×48×35=1M булевых. CP-SAT справляется через `AddExactlyOne` + `OnlyEnforceIf`, но на практике используем `x[instance, T]` + отдельный `room_assign` (см. §03) чтобы снизить до ~30K.
- JSON размер: при 600 instance → ~120KB вход, ~50KB выход — тривиально для stdin/stdout.

## 2.6 Открытые вопросы (решить на ревью)

- Q1: Нужен ли `floor` для `movement` штрафа или считать все переходы кабинета равными?
- Q2: `periods_per_day` фиксирован (7) или настраивается на школу (6/7/8)?
- Q3: Хранить ли `Weights` на школу или на вариант расписания (drafts)?

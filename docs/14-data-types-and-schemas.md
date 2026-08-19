# 📘 Документация по структурам данных, типам и схемам ТУП (для ИИ-агентов и разработчиков)

## 📌 1. Архитектурная иерархия данных ТУП

Нормативный документ **ТУП (Типовая учебная программа)** описывается иерархической структурой из 4 глобальных зон (параграфов):

```
ParsedFullDocument / TupDocumentDetail
├── Метаданные (OrderNumber, OrderDate, AppendixNumber, SubjectId, Language, TargetGrades, Direction)
├── Глава 1 (Provisions): Правовая основа, Цель обучения, Задачи предмета
├── Параграф 1 (Hours): Учебная нагрузка по классам (часы в неделю, часы в году)
├── Параграф 2 (Objectives): Матрица целей обучения (класс, раздел, подраздел, код, описание)
└── Параграф 3 (Quarters - ДСП): Долгосрочный план (четверти ➔ разделы ➔ темы ➔ массив кодов целей)
```

---

## 🦀 2. Модели и типы на стороне Rust (`src/infra/` & `src/domain/`)

### A. Newtype паттерн для строго типизированных ID (`src/domain/ids.rs`)
Для предотвращения неявного смешивания строковых идентификаторов используются строго типизированные обёртки:
- `SubjectId`: Строковый идентификатор предмета (например, `"algebra"`, `"kazakh_tili"`).
- `TupDocumentId`: Уникальный UUID v4 документа ТУП.
- `ObjectiveId`: Уникальный UUID v4 конкретной цели обучения.

### B. Структуры разбора парсера (`src/infra/tup_html_parser.rs`)

```rust
/// Полный распознанный документ со всеми 4 параграфами.
pub struct ParsedFullDocument {
    pub document: ParsedTupDocument,
    pub provisions: ParsedProvisions,
    pub hours: Vec<ParsedHours>,
    pub quarters: Vec<ParsedQuarter>,
}

/// Метаданные + цели Зоны 2
pub struct ParsedTupDocument {
    pub order_number: String,     // "399"
    pub order_date: String,       // "2022-09-16"
    pub appendix_number: i64,     // 1..130
    pub subject_id: String,       // "algebra", "kazakh_tili"
    pub language: String,         // "RU", "KZ", "EN", "DE", "FR" и др.
    pub target_grades: String,    // "5-9", "10-11", "1-4"
    pub direction: TupDirection,  // Common, Emn, Ogn
    pub objectives: Vec<ParsedObjective>,
}

/// Цель обучения (Зона 2)
pub struct ParsedObjective {
    pub grade: i64,
    pub section_number: i64,
    pub subsection_number: i64,
    pub objective_number: i64,
    pub code: String,             // "7.1.1.1" или "10.1.1"
    pub description: String,
}

/// Глава 1: Общие положения
pub struct ParsedProvisions {
    pub legal_basis: String,     // Нормативно-правовая основа
    pub goal_text: String,       // Цель обучения предмету
    pub tasks: Vec<String>,      // Задачи обучения предмета
}

/// Параграф 1: Учебная нагрузка
pub struct ParsedHours {
    pub grade: i64,
    pub hours_per_week: f64,
    pub hours_per_year: i64,
}

/// Параграф 3: Долгосрочный план (ДСП)
pub struct ParsedQuarter {
    pub grade: i64,
    pub quarter_number: i64,      // 1..4
    pub sections: Vec<ParsedSection>,
}

pub struct ParsedSection {
    pub name: String,
    pub topics: Vec<ParsedTopic>,
}

pub struct ParsedTopic {
    pub name: String,
    pub objective_codes: Vec<String>, // ["7.1.1.1", "7.1.1.2"]
}
```

### C. Карта наименований предметов (`subject_slug` в `tup_parser.rs`)
При добавлении новых предметов или языковых вариаций обязательно регистрировать их в карте `subject_slug(&str) -> Option<&'static str>`:
- Всегда нормализуйте строку перед вызовом (`subject_slug(normalize(title))`).
- Казахские предметы содержат оригинальные символы (`Қазақ тілі`, `Әдебиеттік оқу`, `Дүниетану`).

---

## 💻 3. Модели и типы на стороне Frontend (`src/types.ts`)

### A. Элемент списка документов (`TupDocumentListItem`)
Используется для быстрого рендеринга таблицы/селектора списка документов:
```typescript
export interface TupDocumentListItem {
  id: string;
  subjectName: string;      // Человекочитаемое имя предмета
  targetGrades: string;     // "5-9"
  directionStr: string;     // "common" | "emn" | "ogn"
  appendixNumber: number;   // Номер приложения
  orderDate: string;        // "2022-09-16"
  objectiveCount: number;   // Количество целей
  hasDsp: boolean;          // Наличие долгосрочного плана
  language: string;         // "RU" | "KZ" | "EN"
}
```

### B. Детальная карточка документа (`TupDocumentDetail`)
Полный агрегат документа для страницы `TupDetail.tsx`:
```typescript
export interface TupDocumentDetail {
  id: string;
  orderNumber: string;
  orderDate: string;
  appendixNumber: number;
  subjectId: string;
  language: string;
  targetGrades: string;
  direction: "common" | "emn" | "ogn";
  legalBasis: string;
  goalText: string;
  tasks: string[];
  hours: TupHourDto[];
  objectives: LearningObjective[];
  quarters: TupQuarterDto[];
}
```

---

## 🗄 4. Схема Базы Данных SQLite (`Desktop/src-tauri/migrations/`)

```sql
-- Таблица документов ТУП
CREATE TABLE tup_documents (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    order_date TEXT NOT NULL,
    appendix_number INTEGER NOT NULL,
    subject_id TEXT NOT NULL,
    language TEXT NOT NULL,
    target_grades TEXT NOT NULL,
    direction TEXT NOT NULL,
    legal_basis TEXT,
    goal_text TEXT
);

-- Цели обучения
CREATE TABLE learning_objectives (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    section_number INTEGER NOT NULL,
    subsection_number INTEGER NOT NULL,
    objective_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    code TEXT NOT NULL
);

-- Темы ДСП
CREATE TABLE tup_topics (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES tup_sections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    objective_codes TEXT NOT NULL -- Сохраняется как JSON-массив ["7.1.1.1", "7.1.1.2"]
);
```

---

## ⚡ 5. Инварианты и правила работы с данными для ИИ-агентов

1. **Правило нормализации строк**:
   - Перед любыми сравнениями или маппингом наименований вызывайте `normalize(s)`.
   - **НЕ удаляйте** и **НЕ заменяйте** букву `Ұ` (U+04B0) на `ё`. Буква `Ұ` является валидным символом казахского языка.
   - Удалению подлежат только zero-width пробелы (`\u{200B}`) и лишние пробельные символы.

2. **Правило форматирования кодов целей (`formatCode`)**:
   - При сопоставлении кодов между фронтендом и бэкендом (или между Матрицей П2 и ДСП П3) всегда очищайте код от пробелов:
     `const formatCode = (code: string) => code.replace(/\s+/g, "");`

3. **Сортировка и фильтры на Фронтенде (`TupList.tsx`)**:
   - Не используйте прямой `localeCompare` на потенциально `undefined`/`null` полях. Всегда задавайте fallback:
     `const nameA = a.subjectName ?? "";`
   - Для числовых значений используйте `Number(x ?? 0)`.
   - Парсинг классов `targetGrades` подготавливается через диапазон чисел (`parseGrades("5-9")` -> `[5, 6, 7, 8, 9]`).

# 03. Методический контур: ТУП (Типовые учебные программы)

## Обзор

Нормативный базис системы. Единственный источник иерархии «программа → раздел → подраздел → цель обучения».

```
TupDocument ──► Section ──► SubSection ──► LearningObjective
                                             (Код: "7.2.1.2")
```

## Требования

### FR-1.1. Newtype Pattern (исключение примитивной одержимости)
Идентификаторы строго типизированы в Rust и не допускают неявного смешения:
- `SubjectId`
- `TupDocumentId`
- `ObjectiveId`

См. спецификацию Rust (документ 10).

### FR-1.2. Детерминированный код цели
Строковый код цели формата `[Класс].[Раздел].[Подраздел].[Номер]` (например, `7.2.1.2`):
- генерируется **методом ядра**;
- хранится как **вычисляемый столбец базы данных** (`GENERATED ALWAYS AS ... STORED`);
- индексирован в **B-Tree** (`idx_objectives_code`).

## Схема данных

```sql
CREATE TABLE tup_documents (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,      -- номер приказа ГОСО/ТУП
    order_date TEXT NOT NULL,
    appendix_number INTEGER NOT NULL,
    subject_id TEXT NOT NULL,
    language TEXT NOT NULL,
    target_grades TEXT NOT NULL
);

CREATE TABLE learning_objectives (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES tup_documents(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    section_number INTEGER NOT NULL,
    subsection_number INTEGER NOT NULL,
    objective_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    code TEXT GENERATED ALWAYS AS (
        grade || '.' || section_number || '.' || subsection_number || '.' || objective_number
    ) STORED
);

CREATE INDEX idx_objectives_code ON learning_objectives (code);
CREATE INDEX idx_objectives_grade ON learning_objectives (document_id, grade);
```

## Ключевые свойства
- Каскадное удаление от документа к целям, индексация по `document_id + grade` для быстрых выборок по классу.

## Парсинг ТУП (Спецификация экстрактора из HTML Әділет)

Парсер (`tup_html_parser.rs`) учитывает следующие особенности официальных документов:
- **Разделители строк:** Код и описание часто лежат на разных строках, разделённых `<br>`. Строки ячейки склеиваются, и цели извлекаются из склеенного текста с границами описаний между соседними кодами.
- **Точки после кода:** Встречаются опечатки вида `4.2.2.4. декорировать…`. Парсер допускает точку после кода, если за ней следует описание (а не цифра).
- **Голые коды (заголовки колонок):** Ячейки вида `<td><p>8.1.3</p></td>` отбрасываются (цель без описания).
- **Диапазоны классов (`target_grades`):** Извлекаются через регулярные выражения из заголовков («10-11 классов», «для 7-9 классов»).
- **Дедупликация при импорте:** Документы различаются по комбинации `subject_id × target_grades × direction × appendix_number` (одни и те же предметы могут дублироваться в разных приложениях приказа для разных языков/направлений).
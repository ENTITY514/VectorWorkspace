# 07. База знаний и оцифрованные учебники (Textbook Repository)

## 7.1. Доктрина асимметричной нагрузки (Distributed Ingestion Pipeline)

```
[ ТЯЖЕЛЫЙ КОНТУР / Сервер разработчика ]
  • Исходные PDF/Сканы гос. учебников (7-9 классы)
  • Layout Analysis + Surya / Nanonets-OCR-s-GGUF / Qwen-VL (LaTeX)
  • Разметка: Глава ➔ Параграф ➔ Задача (A/B/C) + Маппинг на ТУП
  • Экспорт готового пакета в Облачную Библиотеку (Supabase)
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│             ОБЛАЧНАЯ БИБЛИОТЕКА (Supabase Storage)          │
│   Пакеты учебников: SQLite-файлы / JSON-снапшоты с FTS5     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼ (Скачивание в 1 клик, 0% нагрузки на GPU)
[ ЛЕГКИЙ КОНТУР / Ноутбук учителя ]
  • Локальное хранилище: SQLite FTS5 (мгновенный поиск)
  • Пользовательские файлы:
      - Native PDF: прямое извлечение текстового слоя (10-20 мс)
      - Сканы: локальный CPU-bound Tesseract ➔ Markdown
```

## 7.2. Иерархия базы знаний учебника

Каждый оцифрованный учебник декомпозируется на сущности:

| Сущность | Описание |
|----------|----------|
| `Textbook` | Метаданные: предмет, класс, авторы, издательство, год издания |
| `Chapter / Paragraph` | Главы и параграфы; теоретический блок, **сжатый** для передачи в промпты |
| `TaskUnit` | Отдельное упражнение: физический номер («№ 124 (a)»), условие в LaTeX, уровень сложности (A/B/C), привязка к целям `ObjectiveId` |

## 7.3. Гибридный поисковый индекс (FTS5 + Embedding Lookup)

### Полнотекстовый поиск — SQLite FTS5 (BM25)
- Индексация: номера упражнений, математические термины, ключевые слова.
- Мгновенная выборка конкретных задач (< 5 мс).
- Реализация: виртуальная таблица `textbook_tasks_fts` + триггеры синхронизации (см. документ 09).

### Векторные эмбеддинги теории
- Дополнительный поиск по смысловой близости теоретических блоков (embedding lookup) — помимо терминологического поиска FTS5.

## MCP-интерфейс доступа к книге (безопасный)

Текстовые агенты **не получают сырые сканы страниц**. Агент вызывает специализированные инструменты:

| Инструмент | Назначение |
|------------|------------|
| `fetch_theory(objective_code)` | Сжатый теоретический блок параграфа по коду цели |
| `fetch_exercises(objective_code, difficulty_level, count)` | Готовые задачи в LaTeX для этапа «Практика» КСП |
| `get_exercise_by_number(book_id, paragraph_num, task_num)` | Точный поиск задачи по номеру |

## Схема данных

```sql
CREATE TABLE textbooks (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    publisher TEXT NOT NULL,
    publish_year INTEGER NOT NULL,
    is_official_curriculum INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE textbook_paragraphs (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    paragraph_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    theory_markdown TEXT NOT NULL,
    UNIQUE (book_id, paragraph_number)
);

CREATE TABLE textbook_tasks (
    id TEXT PRIMARY KEY,
    paragraph_id TEXT NOT NULL REFERENCES textbook_paragraphs(id) ON DELETE CASCADE,
    exercise_number_display TEXT NOT NULL,   -- "№ 125(б)"
    raw_latex_condition TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('LevelA', 'LevelB', 'LevelC')),
    answer_latex TEXT NULL
);

CREATE TABLE textbook_task_objectives (
    task_id TEXT NOT NULL REFERENCES textbook_tasks(id) ON DELETE CASCADE,
    objective_code TEXT NOT NULL,            -- маппинг задачи на цель ТУП
    PRIMARY KEY (task_id, objective_code)
);
```

## Сжатие теории для промптов
- `compressed_theory_markdown` — теоретический блок, сокращённый до формул, определений и ключевых утверждений (Context Reducer, документ 08).
- Это уменьшает токены и ускоряет генерацию КСП.
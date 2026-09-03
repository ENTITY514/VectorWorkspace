# VectorWorkspace

Монорепозиторий образовательной платформы: **КТП Hub**, общие auth/каталоги на Supabase, задел под редактор КСП и курсы.

## Документация

👉 **[docs/README.md](./docs/README.md)** — полное оглавление (архитектура, Supabase, правила кода, приложения, roadmap).

## Структура

| Путь | Содержимое |
|------|------------|
| `Desktop/` | Десктоп-приложение (Tauri v2 + React + Rust) |
| `Desktop/src-tauri/` | Rust-ядро: команды, домен, репозитории, миграции SQLite |
| `solver/` | Математическое ядро расписания (Python + OR-Tools CP-SAT) |
| `scripts/` | Вспомогательные скрипты (сокращаются в пользу продукта) |
| `docs/` | Документация |
| `Materials/` | Учебные материалы и спецификации рефакторинга |
| `.env.example` | Шаблон переменных окружения (корень) |

## Быстрый старт

```bash
# 1. Фронтенд и десктоп-оболочка
cd Desktop
npm install
npm run tauri dev

# 2. Математическое ядро (нужен Python 3.13)
pip install -r solver/requirements.txt
python -m pytest solver/tests -q
```

Путь к интерпретатору задаётся переменной `VECTOR_PYTHON`, если
автоопределение не нашло Python с установленным `ortools`.

## Проверки

```bash
cd Desktop && npm run build          # типы и сборка фронтенда
cargo test --manifest-path Desktop/src-tauri/Cargo.toml
python -m pytest solver/tests -q
```

Секреты хранятся **только** в корневом `.env.local`, не внутри приложений.

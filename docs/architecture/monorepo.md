# Монорепозиторий и границы сервисов

## Структура корня

```text
VectorWorkspace/
├── .env.local              # секреты (gitignored), общие для всех приложений
├── .env.example            # шаблон без секретов
├── .gitignore
├── README.md
├── docs/                   # документация платформы
├── supabase/               # общие миграции и заметки по БД
│   └── migrations/
├── KTPHUB/                 # приложение КТП Hub (React CRA)
├── Materials/              # исходные учебные файлы (ТУП/КТП и т.п.)
└── (future) KSPHUB/        # редактор КСП
└── (future) LogicCourse/   # курс логики
```

## Где что лежит

| Артефакт | Куда | Почему |
|----------|------|--------|
| Пароль БД, project ref, anon key | **корень** `.env.local` | Один источник для всех сервисов и CLI |
| SQL-миграции платформы | **`/supabase/migrations`** | Схема общая, не «внутри KTPHUB» |
| Код UI KTPHUB | `/KTPHUB` | Отдельное приложение со своим `package.json` |
| Документация | `/docs` | Единая точка правды |
| Продуктовые идеи KTPHUB | `/KTPHUB/docs/ideas` | Локальный бэклог приложения |

## Правила границ

1. **Не класть platform-секреты** внутрь `KTPHUB/.env*`. Только корневой `.env.local`.
2. **Не дублировать миграции** в приложениях — только `/supabase`.
3. Новое приложение = новая папка + свой frontend stack, но **те же** `SUPABASE_URL` / anon key / `profiles`.
4. Таблицы нового домена именуем с префиксом домена: `ksp_`, `course_`, `lesson_` — не смешивать с `tup_` / `ktp_` без нужды.
5. Общий код (типы профиля, auth helpers), который понадобится 2+ приложениям, выносить в будущем в `/packages/shared` (пока достаточно копировать контракты осторожно или импортировать позже).

## Запуск приложений

### KTPHUB

```bash
cd KTPHUB
npm install
npm start   # подхватывает ../.env.local через dotenv-cli
```

### Будущие Vite-приложения

Добавить в корневой `.env.local` переменные `VITE_SUPABASE_*` и читать их в приложении. Не создавать второй `.env` с паролем БД внутри приложения.

## Git

- Remote: `https://github.com/ENTITY514/VectorWorkspace`
- Секреты, `node_modules`, `build` — в корневом `.gitignore`

# KTPHUB — приложение

React (CRA) + TypeScript + MUI + Redux Toolkit + Supabase.

## Назначение

Автоматизация работы учителя:

- загрузка / каталог **ТУП**
- генерация и редактирование **КТП** (даты, часы, СОР/СОЧ строки)
- титульный лист и пояснительная записка (DOCX)
- журналы и анализ СОР/СОЧ (локальный парсинг)
- публикация КТП в общий каталог

## Запуск

Из корня монорепо должен существовать `.env.local` (см. [supabase/setup](../supabase/setup.md)).

```bash
cd KTPHUB
npm install
npm start
```

Скрипты `start` / `build` / `test` загружают `../.env.local` через `dotenv-cli`.

## Маршруты

| Path | Доступ | Описание |
|------|--------|----------|
| `/login`, `/register` | public | auth |
| `/`, `/ktp` | public* | локальные ТУП/КТП |
| `/tup-catalog` | auth | каталог published ТУП → создать КТП |
| `/ktp-catalog` | auth | каталог published КТП |
| `/admin/tup` | admin | загрузка ТУП в платформу |
| `/ktp-editor/:ktpId` | public* | редактор |
| `/title-page`, `/explanatory-note`, … | public* | остальные инструменты |

\*Часть старых экранов пока без жёсткого guard — постепенно закрывать auth по мере облачной синхронизации.

## Ключевые модули

| Область | Путь |
|---------|------|
| Session / Auth context | `src/entities/session` |
| Repositories | `src/shared/infrastructure/repositories` |
| Admin upload ТУП | `src/features/AdminTupUpload` |
| Каталог ТУП | `src/features/TupCatalog` |
| Каталог КТП | `src/features/KtpCatalog` |
| Publish КТП | `src/features/PublishKtp` |
| Редактор | `src/pages/ktpEditorPage`, `src/features/KTPEditor` |
| Парсер ТУП | `src/shared/api/circulumPlanParser.tsx` |

## Локальные данные (ещё не в облаке)

По-прежнему в `localStorage`:

- `ktps`, `academicPlanData`, `calendarSettings`, кастомные титулы/записки

Облако: каталоги ТУП/КТП + auth. Полный sync черновиков — следующая волна.

## Админ-флоу

1. Зарегистрироваться → SQL: `role = admin`
2. `/admin/tup` — файл + метаданные → publish
3. Учителя видят ТУП в `/tup-catalog`

## Связанные docs

- [data-flow](../architecture/data-flow.md)
- [schema](../supabase/schema.md)
- [repositories](../coding/repositories.md)
- [идеи развития](../../KTPHUB/docs/ideas/TOP_IDEAS.md)

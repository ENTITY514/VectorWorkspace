# Frontend: FSD и декомпозиция

Ориентир — Feature-Sliced Design в облегчённом виде (как уже принято в KTPHUB).

## Слои (сверху вниз)

```text
pages/          маршруты, композиция экрана
widgets/        крупные блоки UI (таблица + фильтры + заголовок)
features/       пользовательские действия (login, upload, publish)
entities/       бизнес-сущности (session, ktp, circulumPlan)
shared/         ui-kit куски, lib, infrastructure
```

Зависимости только **вниз**: `pages → widgets/features → entities → shared`.

## Правила размера компонентов

- Один файл ≈ одна ответственность.
- JSX-компонент без сложной логики; логика в `model/useXxx.ts`.
- Если файл > ~150–200 строк и растёт — режь на подкомпоненты/`model`.
- Новое поведение рядом с фичей, а не «ещё 100 строк» в существующий god-file.

## Пример раскладки фичи

```text
features/AdminTupUpload/
  index.ts                 публичный API
  model/useAdminTupUpload.ts
  ui/AdminTupUploadForm.tsx
```

## Стейт

- **Серверные каталоги / auth** — repositories + лёгкий React state/context.
- **Редактор КТП / локальные черновики** — Redux + `localStorage` (исторически).
- Не складывать в Redux сырые supabase responses без нужды.

## Стили / UI kit

- MUI как текущий design system KTPHUB.
- Новые приложения могут выбрать свой UI kit, но паттерн слоёв тот же.

## i18n

- Словари в `shared/lib/i18n`.
- Новые пользовательские строки — в словари, не хардкод (постепенно вычищать оставшийся хардкод).

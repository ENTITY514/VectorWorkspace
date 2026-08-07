# VectorWorkspace documentation

Документация платформы образовательных инструментов (Казахстан / школы).

## Быстрый старт

1. Скопируй [`.env.example`](../.env.example) → `.env.local` в **корне** репозитория и заполни значения.
2. Примени миграции: [supabase/setup.md](./supabase/setup.md).
3. Запусти KTPHUB: `cd KTPHUB && npm install && npm start`.

## Оглавление

### Архитектура
- [Обзор платформы](./architecture/overview.md)
- [Монорепозиторий и границы сервисов](./architecture/monorepo.md)
- [Потоки данных и local-first](./architecture/data-flow.md)

### Supabase (общий бэкенд)
- [Настройка и окружение](./supabase/setup.md)
- [Схема БД](./supabase/schema.md)
- [Auth, роли, RLS](./supabase/auth-and-rls.md)

### Правила кода
- [Стандарты и принципы](./coding/standards.md)
- [Frontend FSD / декомпозиция](./coding/frontend-fsd.md)
- [Repository pattern](./coding/repositories.md)

### Приложения
- [KTPHUB](./apps/ktphub.md)

### Roadmap
- [Будущие продукты (КСП, курсы логики и др.)](./roadmap/future-services.md)

### Идеи продукта
- [Исторические идеи KTPHUB](../KTPHUB/docs/ideas/TOP_IDEAS.md)

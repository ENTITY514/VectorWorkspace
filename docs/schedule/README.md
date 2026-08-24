# Генератор Школьного Расписания — Папка Планирования

> **Вход**: `docs/schedule/00-overview.md` → читайте по порядку `00 → 07`.
> **Статус**: `Planning` (код не пишется до ревью).
> **OpenSpec**: артефакты в `openspec/changes/add-schedule-cp-sat-engine/` (генерируются после ревью).

## Навигация

| # | Документ | Вопрос на который отвечает |
|---|----------|----------------------------|
| 00 | [Обзор](00-overview.md) | Что строим, границы, глоссарий, принципы |
| 01 | [Цели и Методы](01-goals-and-methods.md) | Зачем CP-SAT, почему не GA/BruteForce, критерии AC-01..AC-10 |
| 02 | [Структуры и JSON-Контракт](02-data-structures-and-json-contract.md) | Какие таблицы, типы Rust/TS, вход/выход JSON |
| 03 | [Алгоритм и Ограничения](03-algorithm-and-constraints.md) | Переменные `x[i,d,p]`, Hard H1..H10, Soft S1..S6, `Minimize` |
| 04 | [Архитектура и Интеграция](04-architecture-and-integration.md) | Tauri+React+Python, stdin/stdout, SolverHost, транзакция |
| 05 | [UI/UX](05-ui-ux.md) | 5 экранов вкладки «Расписание», грид, ползунки весов |
| 06 | [Тестирование](06-testing-strategy.md) | 4 уровня, sanity-split, boundary INFEASIBLE, нагрузка |
| 07 | [Результат и Roadmap](07-expected-results-and-roadmap.md) | Что такое Done, метрики, 5 фаз по 6 недель |

## Как ревьюить

1. Откройте `00-overview.md` → проверьте Scope/Non-Goals.
2. `01` → согласны ли с выбором CP-SAT и AC-критериями.
3. `02` → проверьте JSON-пример на соответствие вашим данным (учителя/классы/кабинеты).
4. `03` → проверьте Hard/Soft полноту (нет ли пропущенного закона РК).
5. `04` → подтвердите IPC (stdin/stdout) vs сокет vs gRPC.
6. `05` → утвердите 5 экранов и изоляцию вкладки.
7. `06` → согласны ли с уровнями тестов и INFEASIBLE-диагностикой.
8. `07` → утвердите 5 фаз и 6 недель.

После `APPROVED` — запуск `/opsx-apply` (или ручной `add-schedule-cp-sat-engine`).

## Связи

- Нормативы: `Materials/Генератор Школьного Расписания в Казахстане.docx`, Приказ № ҚР ДСМ-76.
- Существующие доки: `docs/09-database-schema.md`, `docs/14-data-types-and-schemas.md`, `openspec/specs/schedule-generator/{design,prerequisites}.md`.
- Код: `Desktop/src-tauri/src/` (будет `domain/schedule`, `db/schedule`, `infra/solver_host.rs`), `solver/` (Python), `Desktop/src/domains/schedule/` (React).

## Контакты

Владелец: VectorWorkspace. Вопросы — в PR к `docs/schedule/`.

## Why

Модуль «Расписание» — ключевой функционал приложения для педагогов. Текущий UI содержит англоязычные лейблы (`INFEASIBLE`, `OPTIMAL`, `V2`, `CP-SAT`, `class_id`, `BaseRoom`, `split`, `First/Second`, `OPTIMAL/FEASIBLE`), что недопустимо для целевой аудитории. CSS-классы (`card`, `tabs`, `btn primary`, `badge ok`, `slider-row`, `timetable-grid`, `chip`) не определены — UI визуально сломан. SchedulePage — 380-строчный монолит без модульности.

## What Changes

- **Перевод всех лейблов** на русский язык: статусыsolver, типыкомнат, смены, технические термины
- **Локализацияenum-значений** в `types.ts`: `RoomType`, `Shift`, `Status` — маппинг для отображения
- **ДобавлениеCSS** для всех несуществующих классов расписания по стандарту Design Sandbox
- **RefactorSchedulePage** — разделение на 10 отдельных компонентов в `domains/schedule/ui/`
- **Устранение дублирующего `Stat`** — единый компонент в `shared/ui/Stat.tsx`

## Capabilities

### New Capabilities
- `schedule/localized-ui`: Локализация модуля расписание — все лейблы, типы, статусы на русском языке
- `schedule/css-foundation`: CSS-основа для расписания — все классы по стандарту Design System

### Modified Capabilities
- `schedule/core` (существующий `openspec/specs/schedule/spec.md`): обновление требований кUI — все лейблы на русском, модульная структура компонентов

## Impact

- `Desktop/src/domains/schedule/SchedulePage.tsx` — рефакторинг на 10 компонентов
- `Desktop/src/domains/schedule/ui/` — новые компоненты
- `Desktop/src/types.ts` — локализацияenum-значений
- `Desktop/src/styles.css` — добавлениеCSS для расписания
- `Desktop/src/shared/ui/Stat.tsx` — удаление дубля из `components/ui.tsx`
- `Desktop/src/components/ui.tsx` — удаление `Stat` экспорта

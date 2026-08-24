## 1. Локализация (перевод на русский)

- [x] 1.1 Создать маппины в `types.ts`: `ROOM_TYPE_LABELS`, `SHIFT_LABELS`, `STATUS_LABELS`, `FIELD_LABELS`
- [x] 1.2 Обновить `SchedulePage.tsx`: заменить все англоязычные лейблы на маппины
- [x] 1.3 Обновить `types.ts`: добавить функцию `localizedRoomType()`, `localizedShift()`, `localizedStatus()`

## 2. CSS-основа для расписания

- [x] 2.1 Добавить в `styles.css` классы: `.schedule-page`, `.panel`, `.panel-header`, `.tabs`, `.tab`, `.tab.active`
- [x] 2.2 Добавить классы: `.card`, `.row`, `.actions`, `.notice`, `.error.notice`, `.muted`
- [x] 2.3 Добавить классы: `.btn`, `.btn-primary`, `.btn-small` (по стандарту Design System)
- [x] 2.4 Добавить классы: `.badge`, `.badge-green`, `.badge-red`
- [x] 2.5 Добавить классы: `.slider-row`, `.value`
- [x] 2.6 Добавить классы: `.timetable-grid`, `.chip`, `.readiness`, `.dashboard`, `.curriculum-matrix`

## 3. Рефакторинг SchedulePage

- [x] 3.1 Создать директорию `domains/schedule/ui/`
- [x] 3.2 Вынести `Dashboard` в `ScheduleDashboard.tsx`
- [x] 3.3 Вынести `TeachersTab` в `TeachersTab.tsx`
- [x] 3.4 Вынести `ClassesTab` в `ClassesTab.tsx`
- [x] 3.5 Вынести `RoomsTab` в `RoomsTab.tsx`
- [x] 3.6 Вынести `SubjectsTab` в `SubjectsTab.tsx`
- [x] 3.7 Вынести `CurriculumTab` в `CurriculumTab.tsx`
- [x] 3.8 Вынести `WeightsTab` в `WeightsTab.tsx`
- [x] 3.9 Вынести `GridTab` в `GridTab.tsx`
- [x] 3.10 Вынести `LegacyView` в `LegacyTab.tsx`
- [x] 3.11 Вынести `BenchmarkView` в `ComparisonTab.tsx`
- [x] 3.12 Обновить `SchedulePage.tsx` — импорт компонентов вместо инлайн-определений

## 4. Устранение дубля Stat

- [x] 4.1 Удалить экспорт `Stat` из `components/ui.tsx`
- [x] 4.2 Обновить импорт в `Today.tsx` на `shared/ui/Stat`

## 5. Верификация

- [x] 5.1 Проверить что все компоненты рендерятся без ошибок
- [x] 5.2 Проверить что CSS-классы применяются корректно
- [x] 5.3 Проверить что лейблы на русском
- [x] 5.4 Запустить `cargo test` и `npm run build` без ошибок

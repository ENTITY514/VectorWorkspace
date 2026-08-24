## Why

Текущий UX расписания примитивен: нет подтверждения удаления, нет валидации ввода, нет inline-редактирования, нет печати, нет тултипов. CRUD-интерфейс — только добавить/удалить без редактирования.

## What Changes

- **Inline-редактирование** существующих записей (учителя/классы/кабинеты/предметы)
- **Подтверждение удаления** — диалог «Удалить учителя Иванов И.И.?»
- **Валидация ввода** — подсветка ошибок, проверка уникальности
- **Печать расписания** — кнопка «Печать» с print-friendly версией
- **Тултипы** — при наведении на слот полная информация

## Capabilities

### New Capabilities
- `schedule/ux-polish`: UX-полировка — inline-редактирование, подтверждения, валидация, печать, тултипы

### Modified Capabilities

## Impact

- `Desktop/src/domains/schedule/ui/TeachersTab.tsx` — inline edit + подтверждение
- `Desktop/src/domains/schedule/ui/ClassesTab.tsx` — inline edit + подтверждение
- `Desktop/src/domains/schedule/ui/RoomsTab.tsx` — inline edit + подтверждение
- `Desktop/src/domains/schedule/ui/SubjectsTab.tsx` — inline edit + подтверждение
- `Desktop/src/domains/schedule/ui/GridTab.tsx` — тултипы
- `Desktop/src/styles.css` — стили для inline edit, модалок

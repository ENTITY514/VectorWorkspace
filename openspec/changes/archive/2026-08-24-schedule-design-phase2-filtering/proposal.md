## Why

Текущий фильтр в «Матрице» — одно поле с нечётким поиском по `class_id/teacher_id/room_id`. Педагог не может быстро найти расписание по дню, предмету, смене или подгруппе. Нет пресетов для типичных сценариев («мой день», «первая смена»). CRUD-вкладки не имеют поиска при большом количестве записей.

## What Changes

- **Множественная фильтрация на «Матрице»**: панель чипсов — День (Пн–Сб), Класс (выпадающий), Предмет, Учитель, Кабинет, Смена, Подгруппа
- **Быстрые пресеты**: «Мой день», «Первая смена», «Вторая смена», «Без окон»
- **Поиск в CRUD-вкладках**: строка поиска в списки учителей/классов/кабинетов/предметов

## Capabilities

### New Capabilities
- `schedule/advanced-filtering`: Продвинутая фильтрация расписания — множественные фильтры, пресеты, поиск в справочниках

### Modified Capabilities

## Impact

- `Desktop/src/domains/schedule/ui/GridTab.tsx` — новый UI фильтров
- `Desktop/src/domains/schedule/ui/TeachersTab.tsx` — поиск
- `Desktop/src/domains/schedule/ui/ClassesTab.tsx` — поиск
- `Desktop/src/domains/schedule/ui/RoomsTab.tsx` — поиск
- `Desktop/src/domains/schedule/ui/SubjectsTab.tsx` — поиск
- `Desktop/src/styles.css` — стили для фильтров-чипсов

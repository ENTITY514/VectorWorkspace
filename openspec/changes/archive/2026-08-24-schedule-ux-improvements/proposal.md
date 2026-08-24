## Why

Текущий модуль «Расписание» не позволяет редактировать нагрузку (CurriculumTab read-only), не показывает матрицу доступности учителей (6×8 чекбоксов), использует нативные `alert()` для уведомлений, и не имеет визуализации данных.

## What Changes

- **Редактор нагрузки**: inline-редактор «Класс × Предмет → Учитель × Часы» с добавлением/удалением/редактированием строк
- **Матрица доступности**: UI для 6×8 чекбоксов (день × период) при редактировании учителя
- **Toast-уведомления**: кастомные уведомления об успехе/ошибке вместо `alert()`
- **Графики**: Recharts — окна по учителям, нагрузка по дням, SanPiN-парабола

## Capabilities

### New Capabilities
- `schedule/curriculum-editor`: Редактор нагрузки — inline CRUD для curriculum
- `schedule/availability-matrix`: Матрица доступности — 6×8 чекбоксов для учителя
- `schedule/toast-notifications`: Toast-уведомления — кастомные уведомления
- `schedule/charts`: Графики — визуализация метрик расписания

### Modified Capabilities

## Impact

- `Desktop/src/domains/schedule/ui/CurriculumTab.tsx` — полная переделка
- `Desktop/src/domains/schedule/ui/TeachersTab.tsx` — матрица доступности
- `Desktop/src/domains/schedule/ui/ScheduleDashboard.tsx` — toast
- `Desktop/src/components/ui/Toast.tsx` — новый компонент
- `Desktop/src/domains/schedule/ui/AnalyticsCharts.tsx` — новый компонент
- `Desktop/src/styles.css` — стили для новых компонентов

## Purpose

CSS-основа для модуля «Расписание» — все используемые CSS-классы определены в глобальном стиле по стандарту Design System, обеспечивая визуальную согласованность и профессиональный вид.

## ADDED Requirements

### Requirement: Schedule-Specific CSS Classes

Система SHALL определять CSS-классы для расписания в `styles.css`:

- `.schedule-page` — контейнер страницы
- `.panel`, `.panel-header` — панели с заголовками
- `.tabs`, `.tab`, `.tab.active` — вкладки
- `.card` — карточки данных
- `.row` — строки данных
- `.actions` — кнопки действий
- `.notice`, `.error.notice` — уведомления
- `.muted` — приглушённый текст
- `.btn`, `.btn-primary`, `.btn-small` — кнопки (по стандарту Design System)
- `.badge`, `.badge-green`, `.badge-red` — бейджи статусов
- `.slider-row` — строки ползунков
- `.value` — значения в строках
- `.timetable-grid` — таблица расписания
- `.chip` — чипсы в ячейках
- `.readiness` — readiness-бар
- `.dashboard` — контейнер dashboard
- `.curriculum-matrix` — матрица нагрузки

#### Scenario: Button renders with Design System styles

- **WHEN** компонент использует `className="btn btn-primary"` — **THEN** кнопка отображается с фоном `--accent-primary`, белым текстом, `--radius-sm`, hover-эффектом.

#### Scenario: Badge renders with correct color

- **WHEN** компонент использует `className="badge badge-green"` — **THEN** бейдж отображается с `--success-bg`, `--success-text`, `--success-border`.

### Requirement: Schedule Table Styles

Система SHALL определять стили для таблиц расписания:

- `.timetable-grid` — CSS Grid с 7 столбцами (дни) + заголовок, `gap: 2px`, `--bg-subtle` фон
- `.timetable-grid th` — заголовки дней, `--bg-surface`, `font-weight: 600`
- `.timetable-grid td` — ячейки, `--bg-surface`, `min-height: 60px`, вертикальное выравнивание

#### Scenario: Timetable grid renders 7 columns

- **WHEN** timetable-grid содержит 7 дней — **THEN** CSS Grid создаёт 7 равных столбцов с заголовками Пн-Вс.

### Requirement: Schedule Chip Styles

Система SHALL определять стили для чипсов в ячейках грида:

- `.chip` — `display: inline-flex`, `--radius-xs`, `--bg-subtle`, `font-size: 12px`, `padding: 2px 6px`
- Цвет фона чипса определяется через `style` пропс (цвет предмета)

#### Scenario: Chip renders inside grid cell

- **WHEN** ячейка грида содержит чипс — **THEN** он отображается компактно с圓角 и приглушённым фоном.

### Requirement: Schedule Slider Styles

Система SHALL определять стили для ползунков весов:

- `.slider-row` — `display: flex`, `align-items: center`, `gap: 12px`, label слева, ползунок по центру, значение справа
- `.value` — `min-width: 40px`, `text-align: right`, `font-variant-numeric: tabular-nums`

#### Scenario: Weight slider layout

- **WHEN** отображается ползунок веса — **THEN** label «Окна» слева, ползунок 0-1000 по центру, значение «200» справа.

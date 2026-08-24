## MODIFIED Requirements

### Requirement: Timetable Grid (UI)

Грид SHALL поддерживать 3 режима (`По классам/учителям/кабинетам`, строки периоды, столбцы дни Пн-Сб), фильтры (класс/учитель/кабинет), цвета по `subject_id`, split-диагональ, подсветку окон (жёлтая штриховка), состояния `empty/loading/infeasible/done` + бейдж статуса на русском языке + экспорт XLSX/CSV. **Все лейблы, статусы и типы отображаются на русском языке** (см. `schedule/localized-ui`). CSS-классы определяются в `styles.css` по стандарту Design System (см. `schedule/css-foundation`).

#### Scenario: Grid by class shows lessons

- **WHEN** `c_8a` имеет 3 урока — **THEN** грид «По классам» с фильтром `8А` показывает 3 цветных чипса в правильных `day/period`.

#### Scenario: Grid labels in Russian

- **WHEN** грид отображает столбцы — **THEN** заголовки: Пн, Вт, Ср, Пт, Сб, Вс (на русском).

### Requirement: Dashboard

Dashboard SHALL показывать readiness-бар (учителя/классы/кабинеты/нагрузка), статус последнего запуска (на русском: «Оптимально»/«Решаемо»/«Невозможно»/«Превышено время» + `solver_stats` + разбивка `penalties`), INFEASIBLE-карточку с кликабельными сущностями, кнопки «Сгенерировать»/«Экспорт»/«Очистить»/«Демо» и прогресс `schedule:progress`. **Все кнопки и лейблы на русском языке**.

#### Scenario: Dashboard infeasible card

- **WHEN** последний запуск `INFEASIBLE` по `t_ivanov` — **THEN** карточка показывает русский `reason` и ссылку на учителя (клик → вкладка «Учителя»).

#### Scenario: Generate button label in Russian

- **WHEN** пользователь видит кнопку генерации — **THEN** она отображается как «Сгенерировать» вместо «Generate».

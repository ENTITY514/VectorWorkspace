# Design: Домен «Расписание» в слое намерений

Общие механизмы — в `openspec/changes/ai-core-intent-layer/design.md`. Здесь — только то, что специфично для расписания.

## 1. Команды домена

| Группа | Команда | Изменяет | Параметры (главные) | Спецификация-источник |
|---|---|---|---|---|
| Профиль | `set_teacher_work_mode` | да | teacher, work_days{mode,count}, lessons_per_day{min,max}, periods{first,last}, soft?, reason | school-profile |
| | `set_teacher_availability` | да | teacher, days[], periods[], mode{allow_only,deny}, reason | school-profile |
| | `set_teacher_windows` | да | teacher, weekly_cap?, no_double_window?, avoid_single_lesson_day? | school-profile |
| | `set_class_teacher_first_lesson` | да | scope{all \| teacher}, enabled, strict? | school-profile |
| | `set_inclusion_rules` | да | student, arrives_first?, last_period_max?, last_period_soft?, windows_day?, windows_week? | school-profile |
| | `set_hall_rule` | да | class, allow_small_days[] \| prefer_big (+days), reason | school-profile |
| | `set_room_swap_rule` | да | owner_teacher, weekly_cap?, excluded_classes[] | school-profile |
| | `add_teacher_wish` | да | teacher, rule_code, scope, effect, reason | school-profile |
| Правила | `set_rule_mode` | да | rule_code, mode{hard,soft,off}, scope?, params? | rules-priorities |
| | `set_rule_priority` | да | rule_code, tier 1..5, scope? | rules-priorities |
| | `set_base_cap` | да | metric{sanpin,windows,swaps}, base_version | rules-priorities |
| Доработка | `pin` / `unpin` | да | kind{slot,day,teacher_pattern,class,teacher,primary}, target, reason | revision-mode |
| | `swap_lessons` | да | lesson_a/lesson_b или class+subjects | revision-mode |
| | `run_revision` | да (новая версия) | base_version, budget, minutes?, save_min_moves? | revision-mode |
| | `continue_solve` | да (новая версия) | version, minutes | revision-mode |
| Что если | `estimate_cost` | нет (песочница) | change_set | what-if |
| | `check_feasibility` | нет | change_set? | what-if |
| Запросы | `report_teacher` | нет | teacher \| *, version?, compare_with?, filter? | compare-and-reports |
| | `report_class_teachers` | нет | version?, compare_with? | compare-and-reports |
| | `report_class` | нет | class \| *, section?, version? | compare-and-reports |
| | `report_inclusion` | нет | student, version? | compare-and-reports |
| | `audit` | нет | version?, requirement? | compare-and-reports |
| | `check_collisions` | нет | version? | compare-and-reports |
| | `compare_versions` | нет | versions[] | compare-and-reports |
| | `list_versions` | нет | status?, with_exports? | compare-and-reports |
| | `set_version_status` | да | version \| filter, status, note? | compare-and-reports |
| | `export` | нет | version, formats[] | compare-and-reports |

Служебные `clarify` и `out_of_scope` — общие для ядра.

## 2. Доменные сущности

| Тип | Примеры | Источник словаря |
|---|---|---|
| Версия расписания | «V53», «53-я», «утверждённая», «прошлая», «та, что отправили» | `schedule_variants` (номер, статус) |
| Ученик на инклюзии | имя, «девочка из 7А на ЛУО» | `schedule_inclusion_students` |
| Зал | «большой зал», «малый», «спортзал» | `schedule_rooms.hall_size` |
| Правило каталога | «окна», «два окна подряд», «санпин», «чередование», «обмены», «сдвиги» | `schedule_rule_catalog` (синонимы) |
| Номер урока / время | «первым», «до 5-го», «к 8:15», «после обеда» | `schedule_settings` + звонки |
| Говорящий | «мои уроки», «меня» → текущий пользователь, если он учитель | профиль пользователя |

## 3. Доменное действие в карточке

«Оценить цену» → `estimate_cost(change_set)` (песочница `schedule-what-if`) → карточка цены под карточкой «Понял так».

## 4. Шаблоны объяснений

`templates/schedule/<command>.{ru,kk}.md`; обязательные поля — из `docs/schedule/assistant-eval/explanations.jsonl`
(`must_mention`). Пример для `check_collisions`:

> {{#if no_collisions}}Накладок нет: учитель, класс или кабинет нигде не стоят в двух местах одновременно{{#if do_checked}},
> занятия ДО не пересекаются со школьными уроками{{/if}}.{{/if}}
> {{#if joint_cells}}В выгрузке {{joint_cells}} мест, где учитель указан в нескольких колонках на одном уроке, — это
> совместные уроки класс-комплектов ({{joint_groups}}).{{/if}} *Источник: проверка накладок {{version}}.*

## 5. Панель во вкладке «Расписание»

Общий `AssistantPanel` с доменным контекстом: активная версия, открытый экран (сетка класса/учителя, отчёт),
выделенные уроки. Подсказки-примеры: «есть ли совпадения?», «у кого больше всего окон?», «Мельникову 3 дня».

## 6. Этапы

- **A — запросы**: отчёты, накладки, сравнение, аудит, версии, выгрузка + объяснения.
- **B — изменения профиля и правил** с карточкой и «Оценить цену».
- **C — доработка**: закрепления, `run_revision`, `continue_solve`, `swap_lessons`.

Каждый этап публикуется после прохождения порогов ядра на наборе домена.

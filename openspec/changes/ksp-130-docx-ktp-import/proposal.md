## Why

КСП на 2026-2027 должны создаваться через `vector-mcp` из актуального КТП и выгружаться в docx строго по форме приказа МОН РК № 130 (прил. 4). Сейчас:

- КТП учителя существует только в docx (`H:\КТП\2026-2027\КТП\*.docx`); импорта нет, `ktp_plans` пуст.
- Выгрузка docx есть только во фронтенде (`kspWord.ts`), формулы пишутся текстом — в LibreOffice их приходится вручную превращать в формулы.
- Нет полей для ученицы с ООП (ЗПР) в 8 классе: адаптированная цель (есть в КТП ЗПР) и дифференцированное задание.
- Справочник ценностей не содержит ценностей единой программы «Адал азамат» (ГОСО п. 7) и календаря по месяцам.
- `ksp_create_draft` подставляет первого активного сотрудника (директора), а не автора КСП.

## What Changes

- **Формулы**: модуль `infra/omml.rs` — LaTeX-подмножество ⇄ OMML (`m:oMath`). Текст КСП хранит формулы как `$...$`.
- **Чтение docx**: `infra/docx_read.rs` — таблицы с учётом `gridSpan`/`vMerge`, формулы → `$latex$`.
- **Импорт КТП**: `infra/ktp_docx_import.rs` + бинарник `import_ktp_docx`; колонка «Адаптированная цель» → новое поле урока `adapted_objective` (миграция 0025).
- **КСП**: `header.adaptedGoal` (замкнут на КТП, как цели), `stage.differentiation` (задание для обучающегося с ООП), MCP `ksp_set_assessment` (дескрипторы/баллы), расширение `ksp_update_stage` (`differentiation`, `resources`), `teacherName` в `ksp_create_draft`.
- **«Адал азамат»**: миграция 0026 с 6 ценностями, `domain/adal_azamat.rs` с календарём месяцев; черновик КСП получает ценность месяца по дате урока.
- **Экспорт docx в ядре**: `infra/ksp_docx.rs` по форме № 130, формулы — нативный OMML; MCP `ksp_export_docx`; Tauri-команда `export_ksp_docx`, фронтенд переходит на неё (один генератор).
- **Валидация**: V-19 (есть адаптированная цель — нужен хотя бы один этап с `differentiation`), V-20 (не заполнен воспитательный акцент ценности — предупреждение).

## Non-goals

- Генерация содержания уроков (делают агенты через MCP после этого изменения).
- КСП на казахском языке, ЛУО-программы, xlsx/pdf-экспорт (остаются как есть).
- Импорт КТП через UI приложения.

## Impact

- Rust: `domain/ksp.rs`, `domain/ktp.rs`, `domain/adal_azamat.rs` (new), `infra/omml.rs` (new), `infra/docx_read.rs` (new), `infra/ktp_docx_import.rs` (new), `infra/ksp_docx.rs` (new), `infra/ksp_mcp.rs`, `infra/mcp/*`, `db/repo_ktp.rs`, `db/repo_ksp.rs`, `commands/ksp.rs`, `bin/import_ktp_docx.rs` (new).
- Миграции: `0025_ktp_adapted_objective.sql`, `0026_adal_azamat_values.sql`.
- Frontend: `domains/ksp/kspWord.ts` → вызов Tauri-команды; типы `KspHeader`/`KspStage`.
- Зависимость: `quick-xml`.

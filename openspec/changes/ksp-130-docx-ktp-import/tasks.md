Все пути — от `Desktop/src-tauri/`. Детали — в `design.md` (раздел указан в скобках). После каждой группы: `cargo test --lib` зелёный, `cargo build --bins` без ошибок и без новых warnings.

## 1. Формулы (design §1)

- [x] 1.1 Добавить зависимость `quick-xml = "0.37"` в `Cargo.toml`.
- [x] 1.2 Создать `src/infra/omml.rs`: `Segment`, `split_math`, `latex_to_omml`, `omml_to_latex`; подключить в `src/infra/mod.rs`.
- [x] 1.3 Тесты: каждая конструкция таблицы, вложенность, `split_math` (`\$`, незакрытый `$`), round-trip, XML парсится `quick-xml`.

## 2. Чтение docx (design §2)

- [x] 2.1 Создать `src/infra/docx_read.rs`: `read_docx`, `read_docx_bytes`, `gridSpan`, `vMerge`, `m:oMath` → `$latex$`, абзацы вне таблиц.
- [x] 2.2 Тест на синтетическом docx (собрать в тесте через `zip`).

## 3. Адаптированная цель в КТП (design §3, последний абзац)

- [x] 3.1 Миграция `migrations/0025_ktp_adapted_objective.sql`.
- [x] 3.2 `KtpLesson.adapted_objective` (`src/domain/ktp.rs`, `#[serde(default)]`), чтение/запись в `src/db/repo_ktp.rs` (save, replace, load), все места создания `KtpLesson` (генерация из ТУП — пустая строка).
- [x] 3.3 `LessonOfferRow.adapted_objective` в `src/db/repo_ksp.rs` (все SELECT, которые его заполняют).
- [x] 3.4 MCP: `adaptedObjective` в выдаче `ktp_get_lesson` и `lesson_get_bundle`; параметр `adaptedObjective` в `ktp_update_lesson`.

## 4. Импорт КТП (design §3)

- [x] 4.1 Создать `src/infra/ktp_docx_import.rs` с `ImportParams` и `parse_ktp`.
- [x] 4.2 Создать `src/bin/import_ktp_docx.rs` (+ `[[bin]]` в `Cargo.toml`): `--db --file --subject --grade --year --replace --dry-run`, сводка по четвертям.
- [x] 4.3 Тест `parse_ktp` на синтетическом docx (четверти, vMerge раздела, СОЧ, СОР, цель из двух строк, адаптированная цель, формула в теме, даты сентябрь/январь).

## 5. «Адал азамат» (design §4)

- [x] 5.1 Миграция `migrations/0026_adal_azamat_values.sql`.
- [x] 5.2 `src/domain/adal_azamat.rs` (`value_code_for_month`, `value_code_for_date`) + тесты; подключить в `src/domain/mod.rs`.

## 6. Модель и MCP КСП (design §5)

- [x] 6.1 `KspHeader.adapted_goal`, `KspStage.differentiation` (`#[serde(default)]`), все конструкторы структур, `apply_locked_header`, `locked_header_from_offer`, `ksp_create_draft`.
- [x] 6.2 `ksp_update_stage`: `differentiation`, `resources`; `ksp_update_header`: запрет `adaptedGoal`.
- [x] 6.3 Новый `ksp_set_assessment`.
- [x] 6.4 `ksp_create_draft`: `teacherName` → `VECTOR_TEACHER_NAME` → `default_teacher`; ценность месяца в `value_ids`.
- [x] 6.5 V-19, V-20 в `validate_content` + тесты. Удалить V-11 (баллы в формативных дескрипторах — норма в практике учителя) в `domain/ksp.rs` и `Desktop/src/domains/ksp/kspModel.ts`, вместе с тестами на V-11.
- [x] 6.6 `normalize_params` и описания инструментов в обоих `list_tools`; тест реестра.
- [x] 6.7 TS-типы `KspHeader.adaptedGoal`, `KspStage.differentiation` во фронтенде (`Desktop/src/types`), без поломки `npx tsc --noEmit`.

## 7. Экспорт docx (design §6)

- [x] 7.1 Создать `src/infra/ksp_docx.rs`: `render_ksp_docx`, `ksp_file_name`.
- [x] 7.2 MCP `ksp_export_docx` (+ реестр, `normalize_params`).
- [x] 7.3 Tauri-команда `export_ksp_docx`; фронтенд `kspWord.ts` → команда; удалить TS-генератор docx; `npx tsc --noEmit` без ошибок.
- [x] 7.4 Тесты рендера и имени файла.

## 8. Проверка

- [x] 8.1 `cargo test --lib`, `cargo build --release --bin vector-mcp --bin import_ktp_docx`.
- [ ] 8.2 `cargo clippy --lib --bins` — без новых предупреждений в изменённых файлах.

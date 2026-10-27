# Design: КСП по приказу № 130, OMML-формулы, импорт КТП из docx

Общие правила для всего изменения:

- Стиль — как в окружающем коде: модули `infra/*` без лишних абстракций, ошибки `Result<_, String>` в MCP-слое, `thiserror` в библиотечных модулях при необходимости. Комментарии на русском, кратко.
- Никакого `unwrap()` на пользовательских данных вне тестов.
- Новые поля в serde-структурах КСП — с `#[serde(default)]`, чтобы старые документы в БД читались.
- Каждый новый модуль — с `#[cfg(test)] mod tests`.

## 1. `infra/omml.rs` — формулы

Формат хранения в тексте КСП: формула внутри `$...$`. Литеральный доллар — `\$`.

```rust
pub enum Segment { Text(String), Math(String) }
pub fn split_math(text: &str) -> Vec<Segment>;          // делит строку на текст и формулы
pub fn latex_to_omml(src: &str) -> Result<String, String>; // возвращает "<m:oMath>…</m:oMath>"
pub fn omml_to_latex(omath_xml: &str) -> String;          // для чтения docx; неизвестное → текст узлов
```

Поддерживаемое LaTeX-подмножество (всё остальное — ошибка разбора `latex_to_omml`):

| LaTeX | OMML |
|---|---|
| `\frac{a}{b}`, `\dfrac{a}{b}` | `m:f` (`m:num`, `m:den`) |
| `\sqrt{x}` | `m:rad` с `m:radPr/m:degHide m:val="1"` |
| `\sqrt[n]{x}` | `m:rad` с `m:deg` |
| `x^{2}`, `x^2` | `m:sSup` |
| `x_{1}`, `x_1` | `m:sSub` |
| `x_1^2`, `x_{1}^{2}` | `m:sSubSup` |
| `\left( … \right)`, также `[ ]`, `\{ \}`, `| |` | `m:d` с `m:begChr`/`m:endChr` |
| `\begin{cases} a \\ b \end{cases}` | `m:d` (`begChr="{"`, `endChr=""`) + `m:eqArr` |
| `\vec{a}`, `\overrightarrow{AB}` | `m:acc` с `m:chr m:val="⃗"` |
| `\overline{AB}` | `m:bar` (`m:pos m:val="top"`) |
| `\binom{n}{k}` | `m:d` (скобки) + `m:f` с `m:type m:val="noBar"` |
| `\text{…}` | `m:r` с `m:rPr/m:sty m:val="p"` |
| `\sin \cos \tg \ctg \arcsin \arccos \arctg \arcctg \log \lg \ln` | `m:r` прямым шрифтом (`m:sty p`) |
| `\cdot`·, `\times`×, `\div`÷, `\pm`±, `\mp`∓, `\le \leq`≤, `\ge \geq`≥, `\ne \neq`≠, `\approx`≈, `\equiv`≡, `\sim`∼, `\pi`π, `\alpha`α, `\beta`β, `\gamma`γ, `\varphi \phi`φ, `\Delta`Δ, `\angle`∠, `\triangle`△, `\circ`° (как в `90^\circ`), `\infty`∞, `\in`∈, `\notin`∉, `\cup`∪, `\cap`∩, `\emptyset \varnothing`∅, `\mathbb{R}`ℝ, `\mathbb{N}`ℕ, `\mathbb{Z}`ℤ, `\mathbb{Q}`ℚ, `\parallel`∥, `\perp`⊥, `\Rightarrow`⇒, `\Leftrightarrow`⇔, `\to`→, `\%`%, `\,` (тонкий пробел → пробел), `\{ \}` | `m:r/m:t` с символом |
| `\leqslant`≤, `\geqslant`≥, `\dots \ldots`…, `\cdots`⋯, `\uparrow`↑, `\downarrow`↓, `\nearrow`↗, `\searrow`↘, `\nparallel`∦, `\subset`⊂, `\subseteq`⊆, `\forall`∀, `\exists`∃, `\implies`⇒, `\blacksquare`■, `\blacktriangle`▲, `\smile`⌣, `\lambda`λ, `\psi`ψ, `\tau`τ, `\epsilon`ε, `\iota`ι, `\chi`χ, `\Pi`Π, `\Sigma`Σ, `\sum`∑ | `m:r/m:t` с символом |
| `\quad` (2 пробела), `\qquad` (4 пробела) | `m:r/m:t` с пробелами (`xml:space="preserve"`) |
| `\operatorname{tg}`, любое `\operatorname{…}`, `\max`, `\min` | `m:r` прямым шрифтом (`m:sty p`) |
| `\mathbin{X}` | содержимое группы как есть |
| `\phantom{…}` | ничего (узлы отбрасываются) |
| `\tag{N}`, `\eqno{N}`, `\eqno N` | `m:r` прямым шрифтом с текстом `(N)` |
| `\not\in`∉, `\not\parallel`∦, `\not=`≠, иначе следующий символ + U+0338 | `m:r/m:t` с символом |
| `\widehat{…}`, `\hat{…}` (U+0302), `\breve{…}` (U+0306), `\tilde{…}`, `\widetilde{…}` (U+0303) | `m:acc` с `m:chr` |
| `\underbrace{A}_{B}` | `m:groupChr` (`m:chr m:val="⏟"`, `m:pos m:val="bot"`) в базе `m:sSub` |
| `\begin{aligned} a & b \\ c \end{aligned}` (`&` игнорируется) | `m:eqArr` без `m:d` |
| `\begin{matrix} a & b \\ c & d \end{matrix}` | `m:m` (`m:mr`, ячейки `m:e`) |
| буквы, цифры, `+ - = < > ( ) [ ] , . ; : ! ' /` и `|` | `m:r/m:t` |
| `$$a+b$$` (как и `$a+b$`) | `Segment::Math` в `split_math`: сначала ищется закрывающий `$$`, затем одиночный `$`; незакрытый `$$` — текст |

Требования:
- Соседние простые символы склеиваются в один `m:r` (не по одному символу на run).
- Текст в `m:t` экранируется (`& < > "`), ставится `xml:space="preserve"`, если есть пробелы.
- Вывод — фрагмент с префиксом `m:`; пространство имён объявляет корень документа (`xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"`).
- `omml_to_latex` — обратное преобразование для тех же конструкций (`m:f`, `m:rad`, `m:sSup`, `m:sSub`, `m:sSubSup`, `m:d`, `m:eqArr`, `m:acc`, `m:bar`, `m:func`, `m:r`). Символы из таблицы обратно в команды не превращаются (в выводе остаётся `√`-структура как `\sqrt{}`, а `≤` — как символ `≤`).

Тесты: каждая строка таблицы; вложенность (`\frac{\sqrt{a}}{b^2}`); `split_math` с `\$` и с незакрытым `$` (незакрытый — текст); round-trip `omml_to_latex(latex_to_omml(x))` для конструкций; корректность XML (парсится `quick-xml` без ошибок).

## 2. `infra/docx_read.rs` — чтение таблиц docx

```rust
pub struct DocxCell { pub text: String, pub span: usize }
pub struct DocxTable { pub rows: Vec<Vec<DocxCell>> }
pub struct DocxContent { pub paragraphs: Vec<String>, pub tables: Vec<DocxTable> }
pub fn read_docx(path: &Path) -> Result<DocxContent, String>;
pub fn read_docx_bytes(bytes: &[u8]) -> Result<DocxContent, String>;
```

- Читает `word/document.xml` через `zip` + `quick-xml` (событийный ридер).
- `paragraphs` — абзацы вне таблиц (для шапки КТП: класс, часы в неделю/год).
- В ячейке абзацы склеиваются через `\n`; `w:br` → `\n`; `w:tab` → пробел.
- `m:oMath` внутри абзаца → `$` + `omml_to_latex(...)` + `$`.
- `w:gridSpan` → `span`; `w:vMerge` без `w:val="restart"` (продолжение) → текст ячейки сверху в той же колонке сетки.
- Вложенные таблицы: текст вкладывается в ячейку родителя, отдельной таблицей не выдаются.

## 3. Импорт КТП: `infra/ktp_docx_import.rs` + `bin/import_ktp_docx.rs`

```rust
pub struct ImportParams { pub subject_id: String, pub grade: i64, pub academic_year: String /* "2026-2027" */ }
pub fn parse_ktp(content: &DocxContent, p: &ImportParams) -> Result<KtpPlan, String>;
```

Берётся первая таблица, в заголовке которой есть «Тем» и «Цели обучения».

Колонки ищутся по заголовку (без учёта регистра, по вхождению): «Раздел» → раздел; «Тем» → тема; «Цели обучения» → цели; «Адаптированн» → адаптированная цель; «Дата» → дата; «примечание» → `notes`. Колонки «№»/«№ урока»/«Кол-во часов» не нужны.

Строки:
- **Четверть**: первая непустая ячейка совпадает с `^\s*(\d|I{1,3}|IV)\s*четверть` (без учёта регистра) → новая `KtpQuarter` с номером 1–4. Часы четверти из `(\d+)\s*час` в той же строке — только для контроля (печать в сводке).
- **СОЧ**: строка, где текст «Суммативное оценивание за … четверть» → урок `LessonKind::Soch`, тема = этот текст, целей нет, раздел пустой.
- **Резерв/повторение** (после СОЧ в КТП 8 алгебры: строка, где тема есть, а колонки целей нет, т.к. ячейка объединена) → `LessonKind::Revision`, раздел «Повторение».
- **Обычный урок**: непустая тема. Если в теме есть `СОР\s*№?\s*\d` → `LessonKind::Sor`, иначе `Standard`. Тема сохраняется целиком, переводы строк → `\n`.
- Раздел: убрать хвост вида `(18 часов)` / `(11 часов)` и лишние `/`, пробелы.
- Цели: делить текст по `\n`; строка, начинающаяся с кода `^\d+(\.\d+){3,4}[A-Za-zА-Яа-я]?` (например `8.1.2.5`, `10.4.1.2`), — новая цель: код + описание (без ведущих `-`, `:`, пробелов, без финальной `;`). Строки без кода дописываются к описанию предыдущей цели через пробел.
- Дата `dd.mm` (или `dd.mm.yyyy`): месяц 9–12 → первый год учебного года, 1–8 → второй. Пусто → `None`.
- `global_index` — сквозной с 1; `quarter_index` — с 1 в каждой четверти.
- `hours_per_week` из абзацев шапки: `(\d+)\s*час\w*\s*в\s*неделю` или `часов в неделю:\s*(\d+)`; не найдено — `ceil(уроков четверти / 8)`.
- `total_hours` из шапки (`(\d+)\s*час\w*\s*в\s*(учебном\s*)?году`), иначе число уроков.
- `language = "RU"`, `status = Draft`, `days_of_week = ""`.

Поле урока `adapted_objective: String` — текст колонки «Адаптированная цель» (пусто, если колонки нет).

Миграция `0025_ktp_adapted_objective.sql`: `ALTER TABLE ktp_lessons ADD COLUMN adapted_objective TEXT NOT NULL DEFAULT '';`. Поле читают/пишут `repo_ktp` (save/load/replace), `repo_ksp::load_lesson_header` (`LessonOfferRow.adapted_objective`), MCP `ktp_get_lesson` / `lesson_get_bundle` (ключ `adaptedObjective`), `ktp_update_lesson` (параметр `adaptedObjective`).

Бинарник:
```
import_ktp_docx --db <vector.db> --file <ktp.docx> --subject algebra|geometry|algebra_analysis --grade 8 --year 2026-2027 [--replace] [--dry-run]
```
- Существует план (subject, grade, year): без `--replace` — ошибка; с `--replace` — удалить через `repo_ktp::delete_plan` (если к урокам привязаны КСП — отказ с понятной ошибкой).
- `--dry-run` — только разбор и сводка, без записи.
- Сводка: по каждой четверти — число уроков, сколько СОР/СОЧ/Revision, первая и последняя дата, число уроков без целей и с адаптированной целью.

Тесты: синтетический docx, собранный в тесте через `zip` (таблица с четвертями, объединённой ячейкой раздела `vMerge`, строкой СОЧ на всю ширину, целью из двух строк, СОР в теме, колонкой «Адаптированная цель», формулой `m:oMath` в теме).

## 4. Ценности «Адал азамат»

Миграция `0026_adal_azamat_values.sql` — `INSERT OR IGNORE INTO value_components`, источник `ГОСО (приказ № 348 в ред. № 258-НҚ), п. 7; единая программа воспитания «Адал азамат»`:

| id / code | title_ru | title_kk |
|---|---|---|
| `aa_independence_patriotism` | Независимость и патриотизм | Тәуелсіздік және отаншылдық |
| `aa_unity_solidarity` | Единство и солидарность | Бірлік және ынтымақ |
| `aa_justice_responsibility` | Справедливость и ответственность | Әділдік және жауапкершілік |
| `aa_law_order` | Закон и Порядок | Заң және тәртіп |
| `aa_diligence_professionalism` | Трудолюбие и профессионализм | Еңбекқорлық және кәсіби біліктілік |
| `aa_creation_innovation` | Созидание и новаторство | Жасампаздық және жаңашылдық |

(`id` = `code`.) Старые 8 строк не удалять.

`domain/adal_azamat.rs`:
```rust
pub fn value_code_for_month(month: u32) -> Option<&'static str>;
pub fn value_code_for_date(iso_date: &str) -> Option<&'static str>; // "YYYY-MM-DD"
```
Календарь: 9 → diligence_professionalism; 10 → independence_patriotism; 11 → justice_responsibility; 12 → unity_solidarity; 1 → law_order; 2 → creation_innovation; 3 → independence_patriotism; 4 → diligence_professionalism; 5 → unity_solidarity; 6–8 → `None`.

## 5. Модель КСП

`KspHeader`:
- `#[serde(default)] pub adapted_goal: String` — адаптированная цель урока для обучающегося с ООП. Замкнута на КТП (как `learning_objectives`): заполняется в `ksp_create_draft` и `locked_header_from_offer` из `adapted_objective`, `apply_locked_header` синхронизирует её; `ksp_update_header` её не меняет (ошибка как для темы).

`KspStage`:
- `#[serde(default)] pub differentiation: String` — задание/поддержка для обучающегося с ООП на этом этапе (с примерами, формулы в `$…$`).

MCP:
- `ksp_update_stage` — дополнительно `differentiation` (string) и `resources` (array of string → `ResourceRef { kind: "text", display }`, заменяет список).
- `ksp_set_assessment` (mutating → карантин): `kspId`, `stageId`, `descriptors: [{text, points?}]` (заменяет список), `maxPoints?`, `feedbackMethod?`, `mode?` (`none|formative|summative`). Если `maxPoints` не передан и у всех дескрипторов есть баллы — сумма.
- `ksp_create_draft` — `teacherName?`; иначе переменная окружения `VECTOR_TEACHER_NAME`; иначе `default_teacher`. В `values_component.value_ids` — `value_code_for_date(planned_date)`, если есть.
- `ksp_update_header` — без изменений, кроме запрета `adaptedGoal`.
- `normalize_params`: `adapted_goal`, `adapted_objective`, `teacher_name`, `max_points`, `feedback_method`, `output_dir`.
- Описания новых инструментов в `infra/mcp/mod.rs::list_tools` и `infra/ksp_mcp.rs::list_tools`.

Валидация (`validate_content`):
- **V-19 Blocking**: `header.adapted_goal` не пуст, и ни у одного этапа нет непустого `differentiation` → «Для обучающегося с ООП нужна дифференцированная работа хотя бы на одном этапе».
- **V-20 Warning**: `values_component.value_ids` не пуст, а `values_component.text` пуст → «Не раскрыт воспитательный акцент ценности месяца».
- **V-11 удаляется** (Rust и TS): баллы за задания в формативном оценивании — обычная практика учителя («1 балл за пример»), предупреждение было бы на каждом КСП.

## 6. Экспорт docx: `infra/ksp_docx.rs`

```rust
pub struct DocxExport { pub bytes: Vec<u8>, pub warnings: Vec<String> }
pub fn render_ksp_docx(doc: &KspDocument, value_title: Option<&str>) -> Result<DocxExport, String>;
pub fn ksp_file_name(doc: &KspDocument, quarter_index: Option<i64>) -> String;
```

Пакет docx собирается вручную (`zip`): `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml` (Normal: Times New Roman 12 pt, интервал 1.0, отступы 0), `word/_rels/document.xml.rels`, `docProps/core.xml`. `document.xml` объявляет `xmlns:w` и `xmlns:m`.

Страница A4 альбомная (`w:w=16838 w:h=11906 w:orient=landscape`), поля 1 см (567). Над таблицей по центру жирно: «Краткосрочный (поурочный) план». Одна таблица, сетка 5 колонок `[2600, 4200, 4200, 2700, 1800]` (сумма = 15500 ≤ ширина), рамки одинарные.

Строки шапки (текст левой ячейки жирный; правая — `gridSpan=4`, если не сказано иное):
1. «Раздел» | `section`
2. «Фамилия, имя, отчество (при его наличии) педагога» | `teacher_name`
3. «Дата» | `dd.mm.yyyy`
4. `Класс «{class_name}»` | «Количество присутствующих:» (span 2) | «Количество отсутствующих:» (span 2)
5. «Тема урока» | `topic`
6. «Цели обучения в соответствии с учебной программой» | по строке на цель: `{code} {text}`
7. «Цели урока» | непустые `lesson_goals.all/most/some` по строке; если `adapted_goal` не пуст — строка «Для обучающегося с ООП (ЗПР): {adapted_goal}»
8. (если есть ценность или текст) «Ценность («Адал азамат»)» | `«{value_title}». {values_component.text}`
9. «Ход урока» — одна ячейка `gridSpan=5`, по центру, жирно
10. Заголовок: «Этап урока/ Время» | «Действия педагога» | «Действия ученика» | «Оценивание» | «Ресурсы» (жирно, заливка `F2F2F2`)

Этапы (по `order`): `{StageType::title_ru()}` + новая строка + `({n} мин)` | `teacher_actions` | `student_actions`, затем, если `differentiation` не пуст, — пустая строка, жирное «Для обучающегося с ООП (ЗПР):», текст | оценивание | ресурсы через `\n`.

Ячейка «Оценивание»: строки дескрипторов `– {text} — {points} б.` (без баллов — без хвоста); затем, если есть, `Всего: {max_points} б.`; затем `feedback_method`, если это не `teacher`. Пустая ячейка допустима.

Если `homework.text` не пуст и этапа `Homework` нет — после этапов строка «Домашнее задание» | текст (`gridSpan=4`), с «Проверка: {check_method}».

Текст ячеек: `\n` → новый абзац; в абзаце `split_math` → обычные `w:r` и `m:oMath` (из `latex_to_omml`). В текстовых сегментах `**…**` → жирный `w:r` (`w:b`), маркеры в вывод не попадают; непарная `**` остаётся текстом. Абзац, начинающийся с `– ` или `• `, получает висячий отступ (`w:ind w:left="227" w:hanging="227"`). Ошибка разбора формулы → формула вставляется как обычный текст, сообщение в `warnings` (экспорт не падает).

`ksp_file_name`: `№{quarter_index} {dd.mm.yyyy} {quarter_index}. {первая строка темы}.docx` (как в прошлогодних файлах); запрещённые в Windows символы `<>:"/\|?*` → пробел, формулы `$…$` → их текст без `$` и `\`, длина темы ≤ 100 символов. Без даты/индекса — соответствующие части опускаются.

MCP `ksp_export_docx` (не мутирует БД): `kspId` или `ktpLessonId`, `outputDir` (обяз.), `fileName?`. Если для КСП есть карантин — ошибка «Сначала ksp_commit_staged». Создаёт каталог, пишет файл, возвращает `{ path, warnings }`. `quarter_index` берётся из урока КТП.

Tauri-команда `export_ksp_docx(ksp_id, path)` в `commands/ksp.rs` (регистрация в `lib.rs`); `kspWord.ts` вызывает её через `services/api.ts` после диалога сохранения; TS-генератор docx удаляется.

Тесты: рендер документа с формулой `$\sqrt{2}$` → в `document.xml` есть `<m:oMath>` и нет `$`; `differentiation` попадает в ячейку ученика; `**Карточка**` → жирный run без звёздочек; шапка содержит точные строки формы № 130; `ksp_file_name` чистит символы.

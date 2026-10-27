//! Экспорт КСП в docx по форме приказа № 130.
//!
//! Пакет собирается вручную (`zip`): таблица 5 колонок, альбомная A4.
//! Формулы — только через `crate::infra::omml::{split_math, latex_to_omml}`.

use std::io::{Cursor, Write};

use zip::write::SimpleFileOptions;

use crate::domain::ksp::{KspDocument, StageType};
use crate::infra::omml::{latex_to_omml, split_math, Segment};

/// Результат рендера: байты docx и предупреждения (например, о формулах).
pub struct DocxExport {
    pub bytes: Vec<u8>,
    pub warnings: Vec<String>,
}

// Сетка 5 колонок из design §6 (сумма 15500 ≤ ширины 15704).
// Сетка как в прошлогодних КСП учителя: 7 колонок, ширина 14567.
// Шапка: подпись = колонки 0–1 (4342), значение = 2–6 (10225).
// Ход урока: этап = 0, педагог = 1–2 (4829), ученик = 3–4 (2182), оценивание = 5, ресурсы = 6.
const GRID: [u32; 7] = [2131, 2211, 2618, 980, 1202, 2581, 2844];
const LABEL_W: u32 = GRID[0] + GRID[1];
const VALUE_W: u32 = GRID[2] + GRID[3] + GRID[4] + GRID[5] + GRID[6];
const TEACHER_W: u32 = GRID[1] + GRID[2];
const STUDENT_W: u32 = GRID[3] + GRID[4];
// Висячий отступ для пунктов списков (`– `, `• `), twips.
const HANG: &str = "<w:ind w:left=\"227\" w:hanging=\"227\"/>";

// Разделитель блоков внутри ячейки (`---`): тонкая линия снизу.
const SEPARATOR: &str = "<w:pBdr><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"1\" w:color=\"808080\"/></w:pBdr><w:spacing w:before=\"60\" w:after=\"120\"/>";

/// Экранирование текста для XML.
fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

/// Базовые свойства run: Times New Roman 12 pt.
fn run_pr(bold: bool) -> String {
    let mut s = String::from(
        "<w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\" w:cs=\"Times New Roman\"/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/>",
    );
    if bold {
        s.push_str("<w:b/><w:bCs/>");
    }
    s.push_str("</w:rPr>");
    s
}

fn text_run(text: &str, bold: bool) -> String {
    format!(
        "<w:r>{}<w:t xml:space=\"preserve\">{}</w:t></w:r>",
        run_pr(bold),
        esc(text)
    )
}

/// Текстовый сегмент: `**…**` → жирный run (маркеры не выводятся),
/// непарная `**` остаётся обычным текстом.
fn text_runs(s: &str) -> String {
    let mut parts: Vec<String> = s.split("**").map(|x| x.to_string()).collect();
    // Нечётное число маркеров: последний — обычный текст.
    if parts.len().is_multiple_of(2) {
        let tail = parts.pop().unwrap_or_default();
        let n = parts.len() - 1;
        parts[n] = format!("{}**{tail}", parts[n]);
    }
    let mut out = String::new();
    for (i, p) in parts.iter().enumerate() {
        if p.is_empty() {
            continue;
        }
        out.push_str(&text_run(p, i % 2 == 1));
    }
    out
}

/// Абзац из одной строки: формулы через OMML, остальное — runs.
fn paragraph(line: &str, warnings: &mut Vec<String>) -> String {
    // Разделитель между блоками ячейки: строка `---` → линия под пустым абзацем.
    if line.trim() == "---" {
        return format!("<w:p><w:pPr>{SEPARATOR}</w:pPr>{}</w:p>", text_run("", false));
    }
    // Воздух между абзацами; жирный подзаголовок отделяется сильнее.
    let before = if line.starts_with("**") { 120 } else { 0 };
    let mut ppr = format!("<w:spacing w:before=\"{before}\" w:after=\"60\"/>");
    if line.starts_with("– ") || line.starts_with("• ") {
        // Пункт списка — висячий отступ.
        ppr.push_str(HANG);
    }
    let mut body = String::new();
    for seg in split_math(line) {
        match seg {
            Segment::Text(s) => body.push_str(&text_runs(&s)),
            Segment::Math(src) => match latex_to_omml(&src) {
                Ok(omml) => body.push_str(&omml),
                // Ошибка разбора — формула обычным текстом, экспорт не падает.
                Err(e) => {
                    warnings.push(format!("Формула «${src}$» вставлена текстом: {e}"));
                    body.push_str(&text_run(&format!("${src}$"), false));
                }
            },
        }
    }
    if body.is_empty() {
        body.push_str(&text_run("", false));
    }
    format!("<w:p><w:pPr>{ppr}</w:pPr>{body}</w:p>")
}

/// Текст ячейки: `\n` → новый абзац.
fn cell_paragraphs(text: &str, warnings: &mut Vec<String>) -> String {
    text.split('\n').map(|line| paragraph(line, warnings)).collect()
}

fn tc_open(width: u32, span: Option<u32>, shade: Option<&str>) -> String {
    let mut s = format!("<w:tc><w:tcPr><w:tcW w:w=\"{width}\" w:type=\"dxa\"/>");
    if let Some(n) = span {
        s.push_str(&format!("<w:gridSpan w:val=\"{n}\"/>"));
    }
    if let Some(fill) = shade {
        s.push_str(&format!("<w:shd w:val=\"clear\" w:fill=\"{fill}\"/>"));
    }
    s.push_str("<w:vAlign w:val=\"top\"/></w:tcPr>");
    s
}

/// Ячейка с готовым текстом.
fn cell(text: &str, width: u32, span: Option<u32>, shade: Option<&str>, warnings: &mut Vec<String>) -> String {
    format!(
        "{}{}</w:tc>",
        tc_open(width, span, shade),
        cell_paragraphs(text, warnings)
    )
}

/// Строка шапки: жирный текст слева, значение справа (`gridSpan=4`).
fn meta_row(label: &str, value: &str, warnings: &mut Vec<String>) -> String {
    let label_bold = format!("**{label}**");
    let left = format!("{}{}</w:tc>", tc_open(LABEL_W, Some(2), None), cell_paragraphs(&label_bold, warnings));
    let right = cell(value, VALUE_W, Some(5), None, warnings);
    format!("<w:tr>{left}{right}</w:tr>")
}

/// Дата `YYYY-MM-DD…` → `dd.mm.yyyy`.
fn fmt_date(raw: &Option<String>) -> String {
    let Some(s) = raw.as_ref() else { return String::new() };
    let date = s.split(['T', ' ']).next().unwrap_or(s);
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() >= 3 && parts[0].len() == 4 {
        format!("{}.{}.{}", parts[2], parts[1], parts[0])
    } else {
        s.clone()
    }
}

/// Ячейка «Оценивание»: дескрипторы, итог, способ проверки (кроме `teacher`).
fn assess_text(stage: &crate::domain::ksp::KspStage) -> String {
    let mut lines = Vec::new();
    for d in &stage.assessment.descriptors {
        if let Some(p) = d.points {
            lines.push(format!("– {} — {p} б.", d.text));
        } else {
            lines.push(format!("– {}", d.text));
        }
    }
    if let Some(max) = stage.assessment.max_points {
        lines.push(format!("Всего: {max} б."));
    }
    let fm = stage.assessment.feedback_method.trim();
    if !fm.is_empty() && fm != "teacher" && fm != "none" {
        lines.push(fm.to_string());
    }
    lines.join("\n")
}

/// Текст ячейки ученика: действия + блок ООП при непустом `differentiation`.
fn student_text(stage: &crate::domain::ksp::KspStage) -> String {
    let mut s = stage.student_actions.clone();
    if !stage.differentiation.trim().is_empty() {
        if !s.trim().is_empty() {
            s.push_str("\n\n");
        }
        s.push_str("**Для обучающегося с ООП (ЗПР):**\n");
        s.push_str(stage.differentiation.trim());
    }
    s
}

fn stage_title(t: StageType, minutes: i64) -> String {
    format!("**{}**\n({minutes} мин)", t.title_ru())
}

/// Рендер документа в docx. Название ценности (`value_title`) — из
/// `value_components` по первому `value_ids`, готовит вызывающий слой.
pub fn render_ksp_docx(doc: &KspDocument, value_title: Option<&str>) -> Result<DocxExport, String> {
    let mut warnings = Vec::new();
    let h = &doc.content.header;
    let mut rows = String::new();

    rows.push_str(&meta_row("Раздел", &h.section, &mut warnings));
    rows.push_str(&meta_row(
        "Фамилия, имя, отчество (при его наличии) педагога",
        &h.teacher_name,
        &mut warnings,
    ));
    rows.push_str(&meta_row("Дата", &fmt_date(&h.planned_date), &mut warnings));
    // Класс + присутствующие/отсутствующие.
    {
        let w2: u32 = GRID[2] + GRID[3];
        let w3: u32 = GRID[4] + GRID[5] + GRID[6];
        let class_bold = format!("**Класс «{}»**", h.class_name);
        let left = format!("{}{}</w:tc>", tc_open(LABEL_W, Some(2), None), cell_paragraphs(&class_bold, &mut warnings));
        let mid = cell("Количество присутствующих:", w2, Some(2), None, &mut warnings);
        let right = cell("Количество отсутствующих:", w3, Some(3), None, &mut warnings);
        rows.push_str(&format!("<w:tr>{left}{mid}{right}</w:tr>"));
    }
    rows.push_str(&meta_row("Тема урока", &h.topic, &mut warnings));
    let goals = h
        .learning_objectives
        .iter()
        .map(|o| format!("{} {}", o.code, o.text))
        .collect::<Vec<_>>()
        .join("\n");
    rows.push_str(&meta_row(
        "Цели обучения в соответствии с учебной программой",
        &goals,
        &mut warnings,
    ));
    // Цели урока + адаптированная цель.
    {
        let mut lines: Vec<String> = [&h.lesson_goals.all, &h.lesson_goals.most, &h.lesson_goals.some]
            .into_iter()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string())
            .collect();
        if !h.adapted_goal.trim().is_empty() {
            lines.push(format!("Для обучающегося с ООП (ЗПР): {}", h.adapted_goal.trim()));
        }
        rows.push_str(&meta_row("Цель урока", &lines.join("\n"), &mut warnings));
    }
    // Воспитательная задача (ценность «Адал азамат»): коротко, как в прошлогодних КСП;
    // без текста — название ценности.
    if !h.values_component.value_ids.is_empty() || !h.values_component.text.trim().is_empty() {
        let value_line = match (value_title, h.values_component.text.trim()) {
            (Some(t), "") => format!("«{t}»"),
            (_, text) => text.to_string(),
        };
        rows.push_str(&meta_row("Воспитательная задача:", &value_line, &mut warnings));
    }
    // Разделитель «Ход урока».
    {
        let full: u32 = GRID.iter().sum();
        let inner = format!(
            "{}<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>{}</w:p></w:tc>",
            tc_open(full, Some(7), None),
            text_run("Ход урока", true)
        );
        rows.push_str(&format!("<w:tr>{inner}</w:tr>"));
    }
    // Заголовок этапов.
    {
        let heads = ["Этап урока/ Время", "Действия педагога", "Действия ученика", "Оценивание", "Ресурсы"];
        let mut tr = String::from("<w:tr>");
        let widths = [(GRID[0], None), (TEACHER_W, Some(2)), (STUDENT_W, Some(2)), (GRID[5], None), (GRID[6], None)];
        for (head, (w, span)) in heads.iter().zip(widths) {
            let head_bold = format!("**{head}**");
            tr.push_str(&format!(
                "{}{}</w:tc>",
                tc_open(w, span, Some("F2F2F2")),
                cell_paragraphs(&head_bold, &mut warnings)
            ));
        }
        tr.push_str("</w:tr>");
        rows.push_str(&tr);
    }
    // Этапы по `order`.
    {
        let mut stages = doc.content.stages.clone();
        stages.sort_by_key(|s| s.order);
        for s in &stages {
            let res = s.resources.iter().map(|r| r.display.as_str()).collect::<Vec<_>>().join("\n");
            let title = stage_title(s.stage_type, s.duration_minutes);
            let left = format!("{}{}</w:tc>", tc_open(GRID[0], None, None), cell_paragraphs(&title, &mut warnings));
            let teacher = cell(&s.teacher_actions, TEACHER_W, Some(2), None, &mut warnings);
            let student = cell(&student_text(s), STUDENT_W, Some(2), None, &mut warnings);
            let assess = cell(&assess_text(s), GRID[5], None, None, &mut warnings);
            let resources = cell(&res, GRID[6], None, None, &mut warnings);
            rows.push_str(&format!("<w:tr>{left}{teacher}{student}{assess}{resources}</w:tr>"));
        }
    }
    // Домашнее задание — если текст есть и этапа Homework нет.
    if !doc.content.homework.text.trim().is_empty()
        && !doc.content.stages.iter().any(|s| s.stage_type == StageType::Homework)
    {
        let mut hw = doc.content.homework.text.trim().to_string();
        if !doc.content.homework.check_method.trim().is_empty() {
            hw.push_str(&format!("\nПроверка: {}", doc.content.homework.check_method.trim()));
        }
        let left = format!(
            "{}{}</w:tc>",
            tc_open(LABEL_W, Some(2), None),
            cell_paragraphs("**Домашнее задание**", &mut warnings)
        );
        let right = cell(&hw, VALUE_W, Some(5), None, &mut warnings);
        rows.push_str(&format!("<w:tr>{left}{right}</w:tr>"));
    }

    let grid: String = GRID.iter().map(|w| format!("<w:gridCol w:w=\"{w}\"/>")).collect();
    let document_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
        <w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" \
        xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\" \
        xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\n\
        <w:body>\n\
        <w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>{}</w:p>\n\
        <w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblLayout w:type=\"fixed\"/>\
        <w:tblBorders><w:top w:val=\"single\" w:sz=\"4\"/><w:left w:val=\"single\" w:sz=\"4\"/>\
        <w:bottom w:val=\"single\" w:sz=\"4\"/><w:right w:val=\"single\" w:sz=\"4\"/>\
        <w:insideH w:val=\"single\" w:sz=\"4\"/><w:insideV w:val=\"single\" w:sz=\"4\"/>\
        </w:tblBorders></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{rows}</w:tbl>\n\
        <w:sectPr><w:pgSz w:w=\"16838\" w:h=\"11906\" w:orient=\"landscape\"/>\
        <w:pgMar w:top=\"567\" w:right=\"1134\" w:bottom=\"567\" w:left=\"1134\"/></w:sectPr>\n\
        </w:body></w:document>",
        text_run("Краткосрочный (поурочный) план", true),
    );

    let styles_xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
        <w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\n\
        <w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/>\
        <w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\" w:cs=\"Times New Roman\"/>\
        <w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/></w:rPr>\
        <w:pPr><w:spacing w:line=\"240\" w:lineRule=\"auto\" w:before=\"0\" w:after=\"0\"/>\
        </w:pPr></w:style></w:styles>";
    let content_types = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
        <Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n\
        <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n\
        <Default Extension=\"xml\" ContentType=\"application/xml\"/>\n\
        <Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>\n\
        <Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>\n\
        <Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>\n\
        </Types>";
    let root_rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
        <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n\
        <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>\n\
        <Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>\n\
        </Relationships>";
    let doc_rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
        <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n\
        <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>\n\
        </Relationships>";
    let core_xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
        <cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" \
        xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n\
        <dc:title>Краткосрочный (поурочный) план</dc:title></cp:coreProperties>";

    let mut buf = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, content) in [
            ("[Content_Types].xml", content_types),
            ("_rels/.rels", root_rels),
            ("word/document.xml", document_xml.as_str()),
            ("word/styles.xml", styles_xml),
            ("word/_rels/document.xml.rels", doc_rels),
            ("docProps/core.xml", core_xml),
        ] {
            zip.start_file(name, opts).map_err(|e| format!("docx: {e}"))?;
            zip.write_all(content.as_bytes()).map_err(|e| format!("docx: {e}"))?;
        }
        zip.finish().map_err(|e| format!("docx: {e}"))?;
    }
    Ok(DocxExport { bytes: buf.into_inner(), warnings })
}

/// Имя файла: `№{qi} {dd.mm.yyyy} {qi}. {первая строка темы}.docx`.
/// Запрещённые в Windows символы → пробел, формулы `$…$` → текст без `$` и `\`,
/// длина темы ≤ 100 символов. Без даты/индекса части опускаются.
pub fn ksp_file_name(doc: &KspDocument, quarter_index: Option<i64>) -> String {
    // Первая строка темы, формулы — их текстом без `$` и `\`.
    let first_line: String = doc.content.header.topic.lines().next().unwrap_or("").to_string();
    let mut plain = String::new();
    for seg in split_math(&first_line) {
        match seg {
            Segment::Text(s) => plain.push_str(&s),
            Segment::Math(src) => plain.push_str(&src.replace(['$', '\\'], "")),
        }
    }
    let mut topic: String = plain
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { ' ' } else { c })
        .collect();
    topic = topic.split_whitespace().collect::<Vec<_>>().join(" ");
    if topic.chars().count() > 100 {
        topic = topic.chars().take(100).collect::<String>().trim_end().to_string();
    }
    if topic.is_empty() {
        topic = "КСП".to_string();
    }
    let mut parts = Vec::new();
    if let Some(qi) = quarter_index {
        parts.push(format!("№{qi}"));
    }
    let date = fmt_date(&doc.content.header.planned_date);
    if !date.is_empty() {
        parts.push(date);
    }
    if let Some(qi) = quarter_index {
        parts.push(format!("{qi}."));
    }
    parts.push(topic);
    format!("{}.docx", parts.join(" "))
}

/// `quarter_index` урока КТП — для имени файла.
pub async fn quarter_index_of(pool: &sqlx::SqlitePool, lesson_id: &str) -> Option<i64> {
    sqlx::query_scalar::<_, i64>("SELECT quarter_index FROM ktp_lessons WHERE id = ?1")
        .bind(lesson_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// Название ценности (`title_ru`) по первому `value_ids`.
pub async fn value_title_for(pool: &sqlx::SqlitePool, value_ids: &[String]) -> Option<String> {
    let first = value_ids.first()?;
    sqlx::query_scalar::<_, String>(
        "SELECT title_ru FROM value_components WHERE id = ?1 OR code = ?1",
    )
    .bind(first)
    .bind(first)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::invariants::LessonKind;
    use crate::domain::ksp::{
        draft_from_template, Descriptor, KspContent, KspDocument, KspHeader, KspStatus,
        LearningObjectiveRef, LessonGoals, StageAssessment, ValuesComponent,
    };

    fn header() -> KspHeader {
        KspHeader {
            section: "Квадратные уравнения".into(),
            topic: "Решение задач".into(),
            learning_objectives: vec![LearningObjectiveRef {
                code: "8.4.2.1".into(),
                text: "решать текстовые задачи".into(),
            }],
            planned_date: Some("2026-01-12".into()),
            class_name: "8А".into(),
            teacher_name: "Бабич И.Д.".into(),
            lesson_goals: LessonGoals { all: "решает задачу".into(), most: String::new(), some: String::new() },
            values_component: ValuesComponent { value_ids: vec![], text: String::new() },
            success_criteria: vec![],
            adapted_goal: String::new(),
        }
    }

    fn doc_with(header: KspHeader) -> KspDocument {
        KspDocument {
            id: crate::domain::ids::KspId::new(),
            ktp_lesson_id: "lesson-1".into(),
            ktp_plan_id: "plan-1".into(),
            teacher_id: "t".into(),
            class_name: "8А".into(),
            status: KspStatus::Draft,
            language: "ru".into(),
            schema_version: 1,
            is_approved: false,
            content: draft_from_template(LessonKind::Standard, header, 45),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    /// `word/document.xml` из собранного пакета.
    fn document_xml(exp: &DocxExport) -> String {
        let mut zip =
            zip::ZipArchive::new(Cursor::new(exp.bytes.clone())).expect("валидный zip");
        let mut f = zip.by_name("word/document.xml").expect("document.xml");
        let mut s = String::new();
        std::io::Read::read_to_string(&mut f, &mut s).expect("utf-8");
        s
    }

    #[test]
    fn formula_becomes_omml_without_dollars() {
        let mut h = header();
        h.topic = "Корень $\\sqrt{2}$ и дробь $\\frac{a}{b}$".into();
        let exp = render_ksp_docx(&doc_with(h), None).expect("рендер");
        let xml = document_xml(&exp);
        assert!(xml.contains("<m:oMath>"), "формула → OMML");
        assert!(!xml.contains('$'), "долларов в выводе нет");
        assert!(exp.warnings.is_empty());
    }

    #[test]
    fn bad_formula_is_text_with_warning() {
        let mut h = header();
        h.topic = "Ломаная $\\unknowncmd$".into();
        let exp = render_ksp_docx(&doc_with(h), None).expect("рендер не падает");
        assert_eq!(exp.warnings.len(), 1);
        assert!(document_xml(&exp).contains("unknowncmd"));
    }

    #[test]
    fn differentiation_in_student_cell() {
        let mut h = header();
        h.adapted_goal = "Читать задачу с опорой".into();
        let mut doc = doc_with(h);
        doc.content.stages[2].differentiation = "Карточка-подсказка $x_1$".into();
        let exp = render_ksp_docx(&doc, None).expect("рендер");
        let xml = document_xml(&exp);
        assert!(xml.contains("Для обучающегося с ООП (ЗПР):"));
        assert!(xml.contains("Карточка-подсказка"));
        // Цели урока включают адаптированную цель.
        assert!(xml.contains("Читать задачу с опорой"));
    }

    #[test]
    fn bold_markers_become_bold_run() {
        let mut h = header();
        h.topic = "**Карточка** для работы".into();
        let exp = render_ksp_docx(&doc_with(h), None).expect("рендер");
        let xml = document_xml(&exp);
        assert!(xml.contains("<w:b"), "жирный run");
        assert!(!xml.contains("**"), "маркеры не выводятся");
        assert!(xml.contains("Карточка"));
    }

    #[test]
    fn single_marker_stays_text() {
        let mut h = header();
        h.topic = "2 ** 3 = 8".into();
        let exp = render_ksp_docx(&doc_with(h), None).expect("рендер");
        assert!(document_xml(&exp).contains("2 ** 3 = 8"));
    }

    #[test]
    fn bullet_gets_hanging_indent() {
        let mut h = header();
        h.topic = "План:\n– первый пункт\n• второй пункт".into();
        let exp = render_ksp_docx(&doc_with(h), None).expect("рендер");
        let xml = document_xml(&exp);
        assert!(xml.contains("w:hanging=\"227\""), "висячий отступ");
        assert!(xml.contains("– первый пункт"));
    }

    #[test]
    fn header_has_form_130_strings() {
        let exp = render_ksp_docx(&doc_with(header()), Some("Трудолюбие и профессионализм"))
            .expect("рендер");
        // Без ценности в шапке строка ценности не выводится.
        let xml = document_xml(&exp);
        for s in [
            "Краткосрочный (поурочный) план",
            "Фамилия, имя, отчество (при его наличии) педагога",
            "Цели обучения в соответствии с учебной программой",
            "Класс «8А»",
            "Количество присутствующих:",
            "Количество отсутствующих:",
            "Этап урока/ Время",
            "Домашнее задание",
            "w:orient=\"landscape\"",
            "gridSpan",
        ] {
            assert!(xml.contains(s), "шапка содержит «{s}»");
        }
        assert!(!xml.contains("Воспитательная задача"), "без ценности строки нет");
    }

    #[test]
    fn value_line_uses_title() {
        let mut h = header();
        h.values_component = ValuesComponent {
            value_ids: vec!["aa_diligence_professionalism".into()],
            text: "воспитывать трудолюбие".into(),
        };
        let exp = render_ksp_docx(&doc_with(h), Some("Трудолюбие и профессионализм"))
            .expect("рендер");
        let xml = document_xml(&exp);
        assert!(xml.contains("Воспитательная задача:"));
        assert!(xml.contains("воспитывать трудолюбие"));
    }

    #[test]
    fn assessment_cell_format() {
        let mut doc = doc_with(header());
        let st = &mut doc.content.stages[2];
        st.assessment = StageAssessment {
            mode: crate::domain::ksp::AssessmentMode::Formative,
            descriptors: vec![
                Descriptor { text: "верно решил".into(), points: Some(2) },
                Descriptor { text: "оформил".into(), points: None },
            ],
            max_points: Some(2),
            feedback_method: "взаимооценивание".into(),
        };
        let xml = document_xml(&render_ksp_docx(&doc, None).expect("рендер"));
        assert!(xml.contains("– верно решил — 2 б."));
        assert!(xml.contains("– оформил"));
        assert!(xml.contains("Всего: 2 б."));
        assert!(xml.contains("взаимооценивание"));
    }

    #[test]
    fn file_name_format_and_cleanup() {
        let mut h = header();
        h.topic = "Дробь $\\frac{a}{b}$: разбор <темы>".into();
        h.planned_date = Some("2026-01-12".into());
        let name = ksp_file_name(&doc_with(h), Some(5));
        assert!(name.starts_with("№5 12.01.2026 5. "), "формат: {name}");
        assert!(name.ends_with(".docx"));
        assert!(!name.contains('$') && !name.contains('\\') && !name.contains('<'));
        // Без даты и индекса — только тема.
        let mut h2 = header();
        h2.topic = "Тема".into();
        h2.planned_date = None;
        assert_eq!(ksp_file_name(&doc_with(h2), None), "Тема.docx");
    }

    #[test]
    fn file_name_truncates_long_topic() {
        let mut h = header();
        h.topic = "а".repeat(200);
        h.planned_date = None;
        let name = ksp_file_name(&doc_with(h), None);
        let stem = name.strip_suffix(".docx").expect("суффикс");
        assert!(stem.chars().count() <= 100);
    }

    /// Пример для ручной проверки в LibreOffice: формулы, система cases,
    /// дескрипторы, блок ООП, жирный подзаголовок и пункт списка.
    #[test]
    fn writes_sample_for_libreoffice() {
        let mut h = header();
        h.topic = "Квадратные корни $\\sqrt{2}$".into();
        h.lesson_goals = LessonGoals {
            all: "вычисляет $\\sqrt{2}$".into(),
            most: "сравнивает $\\frac{a}{b}$".into(),
            some: "решает систему $\\begin{cases} x \\\\ y \\end{cases}$".into(),
        };
        h.adapted_goal = "Решать с карточкой-подсказкой".into();
        h.values_component = ValuesComponent {
            value_ids: vec!["aa_diligence_professionalism".into()],
            text: "воспитывать трудолюбие".into(),
        };
        let mut doc = doc_with(h);
        {
            let st = &mut doc.content.stages[2];
            st.teacher_actions = "**Карточка** с примерами:\n– вычисли $\\sqrt{2}$\n– сравни $\\frac{a}{b}$".into();
            st.student_actions = "Решают у доски".into();
            st.differentiation = "Опора: таблица квадратов".into();
            st.assessment = StageAssessment {
                mode: crate::domain::ksp::AssessmentMode::Formative,
                descriptors: vec![
                    Descriptor { text: "верно вычислил".into(), points: Some(1) },
                    Descriptor { text: "оформил решение".into(), points: Some(1) },
                ],
                max_points: Some(2),
                feedback_method: "взаимооценивание".into(),
            };
        }
        let content: KspContent = doc.content.clone();
        let _ = content;
        let exp =
            render_ksp_docx(&doc, Some("Трудолюбие и профессионализм")).expect("рендер");
        assert!(exp.warnings.is_empty(), "пример без warnings: {:?}", exp.warnings);
        let path =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/ksp_sample.docx");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("каталог target");
        }
        std::fs::write(&path, &exp.bytes).expect("запись примера");
        // Пакет читается обратно через docx_read.
        let back = crate::infra::docx_read::read_docx_bytes(&exp.bytes).expect("чтение");
        assert!(!back.tables.is_empty());
    }
}

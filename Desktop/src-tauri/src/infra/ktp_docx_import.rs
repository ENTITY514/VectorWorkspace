//! Импорт КТП из docx: `DocxContent` → `KtpPlan` (design §3).
//!
//! Вертикальные объединения (`vMerge continue`) уже раскрыты в `DocxContent`
//! модулем `docx_read`, здесь идёт позиционный разбор по колонкам шапки.

use chrono::NaiveDate;
use regex::Regex;

use crate::domain::ids::{KtpPlanId, KtpQuarterId};
use crate::domain::invariants::LessonKind;
use crate::domain::ktp::{KtpLesson, KtpPlan, KtpQuarter, KtpStatus, LessonObjective};
use crate::infra::docx_read::{DocxCell, DocxContent, DocxTable};

/// Параметры импорта: в какой план складывать разобранные уроки.
pub struct ImportParams {
    pub subject_id: String,
    pub grade: i64,
    /// Учебный год вида "2026-2027".
    pub academic_year: String,
}

/// Позиции колонок КТП в сетке таблицы (стартовая колонка сетки).
struct Cols {
    section: Option<usize>,
    topic: usize,
    objectives: usize,
    adapted: Option<usize>,
    date: Option<usize>,
    notes: Option<usize>,
}

/// Индекс ячейки, покрывающей колонку сетки `grid_col` (накопленная сумма `span`).
fn cell_index_at(row: &[DocxCell], grid_col: usize) -> Option<usize> {
    let mut cur = 0usize;
    for (i, cell) in row.iter().enumerate() {
        if grid_col < cur + cell.span {
            return (grid_col >= cur).then_some(i);
        }
        cur += cell.span;
    }
    None
}

/// Ячейка, покрывающая колонку сетки `grid_col`.
fn cell_at(row: &[DocxCell], grid_col: usize) -> Option<&DocxCell> {
    cell_index_at(row, grid_col).map(|i| &row[i])
}

/// Разбирает содержимое docx в план КТП.
pub fn parse_ktp(content: &DocxContent, p: &ImportParams) -> Result<KtpPlan, String> {
    let (year1, year2) = split_year(&p.academic_year)?;
    let (table, header_at) = find_ktp_table(content)?;
    let cols = map_columns(&table.rows[header_at])?;
    let hours_per_week = hours_from_header(&content.paragraphs);
    let total_hours = total_from_header(&content.paragraphs);
    let quarter_re = Regex::new(r"(?i)^\s*(\d|iv|i{1,3})\s*четверть")
        .map_err(|e| format!("внутренняя ошибка шаблона четверти: {e}"))?;
    let sor_re = Regex::new(r"(?i)сор\s*№?\s*\d")
        .map_err(|e| format!("внутренняя ошибка шаблона СОР: {e}"))?;

    let plan_id = KtpPlanId::new();
    let mut quarters: Vec<KtpQuarter> = Vec::new();
    let mut global_index: i64 = 0;
    for row in table.rows.iter().skip(header_at + 1) {
        // Первая непустая ячейка строки.
        let first = row
            .iter()
            .map(|c| c.text.trim())
            .find(|t| !t.is_empty())
            .unwrap_or("");
        if first.is_empty() {
            continue;
        }
        if let Some(qn) = parse_quarter(&quarter_re, first) {
            quarters.push(KtpQuarter {
                id: KtpQuarterId::new(),
                ktp_id: plan_id,
                quarter_number: qn,
                hours_per_week: 0,
                lessons: Vec::new(),
            });
            continue;
        }
        // Урок до первой четверти — пропуск (некуда привязать).
        let Some(q) = quarters.last_mut() else {
            continue;
        };
        // СОЧ ищется по всей строке: строка идёт на всю ширину таблицы.
        let row_lc = row
            .iter()
            .map(|c| c.text.trim())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
            .to_lowercase();
        if row_lc.contains("суммативное оценивание") {
            global_index += 1;
            let qi = q.lessons.len() as i64 + 1;
            // Тема — ячейка с текстом СОЧ, а не первая непустая (`1` часа).
            let soch_topic = row
                .iter()
                .map(|c| c.text.trim())
                .find(|t| t.to_lowercase().contains("суммативное оценивание"))
                .unwrap_or(first)
                .to_string();
            let mut lesson =
                KtpLesson::new(q.id, global_index, qi, soch_topic, LessonKind::Soch);
            lesson.planned_date = cols
                .date
                .and_then(|g| parse_date(grid_text(row, Some(g)), year1, year2));
            q.lessons.push(lesson);
            continue;
        }
        let topic = grid_text(row, Some(cols.topic)).trim().to_string();
        if topic.is_empty() {
            continue;
        }
        let topic_idx = cell_index_at(row, cols.topic);
        // Одна ячейка покрывает и тему, и цели/раздел: текст относится
        // к теме, цели и раздел пустые (обзорные строки после СОЧ,
        // повторение в начале четверти).
        let obj_idx = cell_index_at(row, cols.objectives);
        let obj_text = if obj_idx == topic_idx {
            String::new()
        } else {
            grid_text(row, Some(cols.objectives)).trim().to_string()
        };
        let section = match cols.section {
            Some(g) if cell_index_at(row, g) == topic_idx => String::new(),
            _ => clean_section(grid_text(row, cols.section)),
        };
        // СОР — по теме, даже без целей; без целей: обычный урок своего
        // раздела с пустыми целями; пусты и раздел, и цели — резерв после СОЧ.
        let kind = if sor_re.is_match(&topic) {
            LessonKind::Sor
        } else if obj_text.is_empty() && section.is_empty() {
            LessonKind::Revision
        } else {
            LessonKind::Standard
        };
        global_index += 1;
        let qi = q.lessons.len() as i64 + 1;
        let mut lesson = KtpLesson::new(q.id, global_index, qi, topic, kind);
        lesson.section_name = if kind == LessonKind::Revision {
            "Повторение".to_string()
        } else {
            section
        };
        lesson.objectives =
            parse_objectives(&obj_text).map_err(|e| format!("урок {global_index}: {e}"))?;
        lesson.planned_date = cols
            .date
            .and_then(|g| parse_date(grid_text(row, Some(g)), year1, year2));
        lesson.adapted_objective = adapted_of(row, &cols);
        lesson.notes = notes_of(row, &cols);
        q.lessons.push(lesson);
    }

    let total_lessons: usize = quarters.iter().map(|q| q.lessons.len()).sum();
    if total_lessons == 0 {
        return Err("в таблице КТП не найдено уроков".to_string());
    }
    for q in &mut quarters {
        q.hours_per_week = hours_per_week
            .unwrap_or_else(|| (q.lessons.len() as i64 + 7) / 8);
    }
    let now = now_iso();
    Ok(KtpPlan {
        id: plan_id,
        subject_id: p.subject_id.clone(),
        grade: p.grade,
        language: "RU".to_string(),
        academic_year: p.academic_year.clone(),
        total_hours: total_hours.unwrap_or(total_lessons as i64),
        status: KtpStatus::Draft,
        created_at: now.clone(),
        updated_at: now,
        days_of_week: String::new(),
        quarters,
    })
}

/// "2026-2027" → (2026, 2027).
fn split_year(academic_year: &str) -> Result<(i32, i32), String> {
    let parts: Vec<&str> = academic_year.split(['-', '/']).map(str::trim).collect();
    if parts.len() != 2 {
        return Err(format!(
            "учебный год должен быть вида \"2026-2027\", получено \"{academic_year}\""
        ));
    }
    let y1: i32 = parts[0]
        .parse()
        .map_err(|_| format!("плохой год в \"{academic_year}\""))?;
    let y2: i32 = parts[1]
        .parse()
        .map_err(|_| format!("плохой год в \"{academic_year}\""))?;
    Ok((y1, y2))
}

/// Первая таблица, в шапке которой есть «Тем» и «Цели обучения».
/// Возвращает таблицу и индекс строки шапки.
fn find_ktp_table(content: &DocxContent) -> Result<(&DocxTable, usize), String> {
    for table in &content.tables {
        for (i, row) in table.rows.iter().enumerate() {
            let has_topic = row.iter().any(|c| {
                let t = c.text.to_lowercase();
                t.contains("тем") && !t.contains("цели")
            });
            let has_objectives = row
                .iter()
                .any(|c| c.text.to_lowercase().contains("цели обучения"));
            if has_topic && has_objectives {
                return Ok((table, i));
            }
        }
    }
    Err("в документе нет таблицы КТП (шапка с «Тем» и «Цели обучения» не найдена)".to_string())
}

/// Позиции колонок СЕТКИ по строке шапки (без учёта регистра, по вхождению).
fn map_columns(header: &[DocxCell]) -> Result<Cols, String> {
    let mut section = None;
    let mut topic = None;
    let mut objectives = None;
    let mut adapted = None;
    let mut date = None;
    let mut notes = None;
    let mut grid = 0usize;
    for cell in header.iter() {
        let start = grid;
        let t = cell.text.to_lowercase();
        if t.contains("раздел") && section.is_none() {
            section = Some(start);
        } else if t.contains("тем") && !t.contains("цели") && topic.is_none() {
            topic = Some(start);
        } else if t.contains("цели обучения") && objectives.is_none() {
            objectives = Some(start);
        } else if t.contains("адаптированн") && adapted.is_none() {
            adapted = Some(start);
        } else if t.contains("дата") && date.is_none() {
            date = Some(start);
        } else if t.contains("примечание") && notes.is_none() {
            notes = Some(start);
        }
        grid += cell.span;
    }
    let (Some(topic), Some(objectives)) = (topic, objectives) else {
        return Err("в шапке КТП нет колонок темы или целей обучения".to_string());
    };
    Ok(Cols {
        section,
        topic,
        objectives,
        adapted,
        date,
        notes,
    })
}

/// Текст ячейки, покрывающей колонку сетки; нет колонки или ячейки — пусто.
fn grid_text(row: &[DocxCell], grid_col: Option<usize>) -> &str {
    match grid_col {
        Some(g) => cell_at(row, g).map(|c| c.text.as_str()).unwrap_or(""),
        None => "",
    }
}

fn adapted_of(row: &[DocxCell], cols: &Cols) -> String {
    let Some(a) = cols.adapted else {
        return String::new();
    };
    let a_idx = cell_index_at(row, a);
    // Одна ячейка покрывает и цели, и адаптированную цель (или тему
    // и адаптированную): текст относится к целям/теме, адаптированная пустая.
    if a_idx == cell_index_at(row, cols.objectives) || a_idx == cell_index_at(row, cols.topic) {
        return String::new();
    }
    grid_text(row, Some(a)).trim().to_string()
}

fn notes_of(row: &[DocxCell], cols: &Cols) -> String {
    grid_text(row, cols.notes).trim().to_string()
}

/// Номер четверти 1–4 из первой ячейки строки (`1 четверть`, `III четверть`).
fn parse_quarter(re: &Regex, first: &str) -> Option<i64> {
    let caps = re.captures(first)?;
    match caps[1].to_lowercase().as_str() {
        "1" | "i" => Some(1),
        "2" | "ii" => Some(2),
        "3" | "iii" => Some(3),
        "4" | "iv" => Some(4),
        _ => None,
    }
}

/// Убирает хвост `(18 часов)` и лишние `/` и пробелы.
fn clean_section(raw: &str) -> String {
    let hours_tail = Regex::new(r"(?i)\s*\(\d+\s*час[^)]*\)").ok();
    let mut s = raw.to_string();
    if let Some(re) = hours_tail {
        s = re.replace_all(&s, "").to_string();
    }
    // Абзацы ячейки в одну строку.
    let mut out = String::with_capacity(s.len());
    for word in s.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(word);
    }
    out.trim_matches(|c| c == '/' || c == ' ').trim().to_string()
}

/// Цели из текста ячейки: строки с кодом — новые цели, строки без кода —
/// дописываются к описанию предыдущей через пробел.
fn parse_objectives(text: &str) -> Result<Vec<LessonObjective>, String> {
    // Код из 3–5 частей (`10.2.1` в геометрии 10 ЕМН, `8.1.2.5`), допускает
    // пробелы вокруг точек (`8. 3.3.1`); хранится без них.
    let code_re = Regex::new(r"^(\d+(?:\s*\.\s*\d+){2,4}[A-Za-zА-Яа-яЁё]?)")
        .map_err(|e| format!("внутренняя ошибка шаблона кода цели: {e}"))?;
    let mut out: Vec<LessonObjective> = Vec::new();
    for raw_line in text.split('\n') {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(m) = code_re.find(line) {
            if m.start() == 0 {
                let code: String =
                    m.as_str().chars().filter(|c| !c.is_whitespace()).collect();
                // Описание: без ведущих `-`, `:` и пробелов; финальную `;`
                // убирает проход в конце (промежуточные `;` сохраняются).
                let desc = line[m.end()..]
                    .trim_start_matches(|c: char| {
                        c.is_whitespace() || c == '-' || c == '–' || c == '—' || c == ':'
                    })
                    .trim()
                    .to_string();
                out.push(LessonObjective {
                    code,
                    description: desc,
                });
                continue;
            }
        }
        // Строка без кода — продолжение предыдущей цели; до первого кода —
        // цель без кода (текст не теряется).
        let tail = line.trim_end_matches([';', ' ', '\t']).trim();
        match out.last_mut() {
            Some(last) => {
                if !last.description.is_empty() {
                    last.description.push(' ');
                }
                last.description.push_str(tail);
            }
            None => out.push(LessonObjective {
                code: String::new(),
                description: tail.to_string(),
            }),
        }
    }
    for obj in &mut out {
        obj.description = obj
            .description
            .trim_end_matches(|c| c == ';' || c == ' ' || c == '\t')
            .trim()
            .to_string();
    }
    Ok(out)
}

/// Дата `dd.mm` или `dd.mm.yyyy`; месяц 9–12 → первый год, 1–8 → второй.
fn parse_date(text: &str, year1: i32, year2: i32) -> Option<NaiveDate> {
    let re = Regex::new(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?").ok()?;
    let caps = re.captures(text)?;
    let day: u32 = caps[1].parse().ok()?;
    let month: u32 = caps[2].parse().ok()?;
    let year: i32 = match caps.get(3) {
        Some(y) => y.as_str().parse().ok()?,
        None if month >= 9 => year1,
        None => year2,
    };
    NaiveDate::from_ymd_opt(year, month, day)
}

/// Часы в неделю из шапки: `N час… в неделю` или `часов в неделю: N`.
fn hours_from_header(paragraphs: &[String]) -> Option<i64> {
    let before = Regex::new(r"(?i)(\d+)\s*час\w*\s*в\s*неделю").ok()?;
    let after = Regex::new(r"(?i)часов в неделю:\s*(\d+)").ok()?;
    for para in paragraphs {
        if let Some(caps) = before.captures(para) {
            if let Ok(n) = caps[1].parse() {
                return Some(n);
            }
        }
        if let Some(caps) = after.captures(para) {
            if let Ok(n) = caps[1].parse() {
                return Some(n);
            }
        }
    }
    None
}

/// Годовая норма из шапки: `N час… в (учебном) году`.
fn total_from_header(paragraphs: &[String]) -> Option<i64> {
    let re = Regex::new(r"(?i)(\d+)\s*час\w*\s*в\s*(учебном\s*)?году").ok()?;
    for para in paragraphs {
        if let Some(caps) = re.captures(para) {
            if let Ok(n) = caps[1].parse() {
                return Some(n);
            }
        }
    }
    None
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    /// Корень из x в OMML (как в тестах `docx_read`).
    const SQRT_X: &str = "<m:oMath><m:rad><m:radPr><m:degHide m:val=\"1\"/></m:radPr>\
                          <m:deg/><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>";

    fn esc(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }

    fn para_xml(inner: &str) -> String {
        format!("<w:p><w:r><w:t>{}</w:t></w:r></w:p>", esc(inner))
    }

    fn cell_xml(paras: &str) -> String {
        format!("<w:tc>{paras}</w:tc>")
    }

    fn cell_restart(paras: &str) -> String {
        format!("<w:tc><w:tcPr><w:vMerge w:val=\"restart\"/></w:tcPr>{paras}</w:tc>")
    }

    fn cell_continue() -> String {
        "<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>".to_string()
    }

    fn cell_span(paras: &str, n: usize) -> String {
        format!("<w:tc><w:tcPr><w:gridSpan w:val=\"{n}\"/></w:tcPr>{paras}</w:tc>")
    }

    fn row_xml(cells: &[String]) -> String {
        format!("<w:tr>{}</w:tr>", cells.join(""))
    }

    fn params() -> ImportParams {
        ImportParams {
            subject_id: "algebra".to_string(),
            grade: 8,
            academic_year: "2026-2027".to_string(),
        }
    }

    /// Собирает docx в памяти и разбирает в план.
    fn parse_doc(paragraphs: &[&str], rows: &[String]) -> KtpPlan {
        let paras: String = paragraphs.iter().map(|t| para_xml(t)).collect();
        let table = format!("<w:tbl>{}</w:tbl>", rows.join(""));
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
<w:body>{paras}{table}</w:body>
</w:document>"#
        );
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let opts =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("word/document.xml", opts).unwrap();
            zip.write_all(xml.as_bytes()).unwrap();
            zip.finish().unwrap();
        }
        let content = crate::infra::docx_read::read_docx_bytes(&buf.into_inner())
            .unwrap_or_else(|e| panic!("разбор docx: {e}"));
        parse_ktp(&content, &params()).unwrap_or_else(|e| panic!("parse_ktp: {e}"))
    }

    fn header_row() -> String {
        row_xml(&[
            cell_xml(&para_xml("№")),
            cell_xml(&para_xml("Раздел долгосрочного плана")),
            cell_xml(&para_xml("Темы")),
            cell_xml(&para_xml("Цели обучения")),
            cell_xml(&para_xml("Адаптированная цель")),
            cell_xml(&para_xml("Дата")),
            cell_xml(&para_xml("Примечание")),
        ])
    }

    fn ktp_rows() -> Vec<String> {
        vec![
            header_row(),
            // Четверть на всю ширину.
            row_xml(&[cell_span(&para_xml("1 четверть (16 часов)"), 7)]),
            // Обычный урок: раздел с хвостом часов, формула в теме, цель из двух строк.
            row_xml(&[
                cell_xml(&para_xml("1")),
                cell_restart(&para_xml("Квадратные корни (8 часов)")),
                cell_xml(&format!(
                    "{}<w:p><w:r><w:t>Квадратный корень, {}</w:t></w:r>{}</w:p>",
                    para_xml("часть первая"),
                    "\\sqrt{x}",
                    SQRT_X
                )),
                cell_xml(&format!(
                    "{}{}",
                    para_xml("8.1.2.5 - усвоить понятие корня;"),
                    para_xml("продолжение описания цели")
                )),
                cell_xml(&para_xml("Читать с опорой")),
                cell_xml(&para_xml("03.09")),
                cell_xml(&para_xml("")),
            ]),
            // СОР, раздел тянется через vMerge.
            row_xml(&[
                cell_xml(&para_xml("2")),
                cell_continue(),
                cell_xml(&para_xml("СОР № 1 «Квадратные корни»")),
                cell_xml(&para_xml("8.1.2.6 - выполнять действия с корнями;")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("10.09")),
                cell_xml(&para_xml("")),
            ]),
            // СОЧ на всю ширину.
            row_xml(&[cell_span(&para_xml("Суммативное оценивание за 1 четверть"), 7)]),
            // Резерв после СОЧ: пусты и раздел, и цели.
            row_xml(&[
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("Повторение материала 1 четверти")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("07.11")),
                cell_xml(&para_xml("")),
            ]),
            // Вторая четверть, даты января → второй год.
            row_xml(&[cell_span(&para_xml("2 четверть"), 7)]),
            row_xml(&[
                cell_xml(&para_xml("5")),
                cell_xml(&para_xml("Квадратные уравнения (9 часов)")),
                cell_xml(&para_xml("Решение квадратных уравнений")),
                cell_xml(&para_xml("10.4.1.2 - решать квадратные уравнения;")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("14.01")),
                cell_xml(&para_xml("к доске")),
            ]),
            row_xml(&[
                cell_xml(&para_xml("6")),
                cell_xml(&para_xml("Квадратные уравнения (9 часов)")),
                cell_xml(&para_xml("Теорема Виета")),
                cell_xml(&para_xml("10.4.1.3: знать теорему Виета")),
                cell_xml(&para_xml("Карточка-подсказка")),
                cell_xml(&para_xml("20.01.2027")),
                cell_xml(&para_xml("")),
            ]),
        ]
    }

    #[test]
    fn full_parse_quarters_sor_soch_revision() {
        let plan = parse_doc(
            &["5 часов в неделю", "Всего 102 часа в учебном году"],
            &ktp_rows(),
        );
        assert_eq!(plan.subject_id, "algebra");
        assert_eq!(plan.grade, 8);
        assert_eq!(plan.language, "RU");
        assert_eq!(plan.status, KtpStatus::Draft);
        assert_eq!(plan.total_hours, 102);
        assert_eq!(plan.quarters.len(), 2);

        let q1 = &plan.quarters[0];
        assert_eq!(q1.quarter_number, 1);
        assert_eq!(q1.hours_per_week, 5);
        assert_eq!(q1.lessons.len(), 4);

        // Сквозная и внутренняя нумерация.
        let globals: Vec<i64> = q1.lessons.iter().map(|l| l.global_index).collect();
        assert_eq!(globals, vec![1, 2, 3, 4]);
        let inner: Vec<i64> = q1.lessons.iter().map(|l| l.quarter_index).collect();
        assert_eq!(inner, vec![1, 2, 3, 4]);

        // Обычный урок.
        let first = &q1.lessons[0];
        assert_eq!(first.lesson_type, LessonKind::Standard);
        assert_eq!(first.section_name, "Квадратные корни");
        assert!(first.topic_title.contains("$\\sqrt{x}$"), "{}", first.topic_title);
        assert_eq!(first.objectives.len(), 1);
        assert_eq!(first.objectives[0].code, "8.1.2.5");
        assert_eq!(
            first.objectives[0].description,
            "усвоить понятие корня; продолжение описания цели"
        );
        assert_eq!(first.adapted_objective, "Читать с опорой");
        assert_eq!(
            first.planned_date,
            NaiveDate::from_ymd_opt(2026, 9, 3)
        );

        // СОР с разделом из vMerge.
        let sor = &q1.lessons[1];
        assert_eq!(sor.lesson_type, LessonKind::Sor);
        assert_eq!(sor.section_name, "Квадратные корни");
        assert_eq!(
            sor.planned_date,
            NaiveDate::from_ymd_opt(2026, 9, 10)
        );

        // СОЧ: тема — текст строки, раздел пуст, целей нет.
        let soch = &q1.lessons[2];
        assert_eq!(soch.lesson_type, LessonKind::Soch);
        assert_eq!(soch.topic_title, "Суммативное оценивание за 1 четверть");
        assert!(soch.section_name.is_empty());
        assert!(soch.objectives.is_empty());

        // Резерв без целей.
        let rev = &q1.lessons[3];
        assert_eq!(rev.lesson_type, LessonKind::Revision);
        assert_eq!(rev.section_name, "Повторение");
        assert_eq!(
            rev.planned_date,
            NaiveDate::from_ymd_opt(2026, 11, 7)
        );

        // Вторая четверть: январь → второй год учебного года.
        let q2 = &plan.quarters[1];
        assert_eq!(q2.quarter_number, 2);
        assert_eq!(q2.lessons.len(), 2);
        assert_eq!(q2.lessons[0].global_index, 5);
        assert_eq!(q2.lessons[0].quarter_index, 1);
        assert_eq!(q2.lessons[0].section_name, "Квадратные уравнения");
        assert_eq!(
            q2.lessons[0].planned_date,
            NaiveDate::from_ymd_opt(2027, 1, 14)
        );
        assert_eq!(q2.lessons[0].notes, "к доске");
        assert_eq!(
            q2.lessons[1].planned_date,
            NaiveDate::from_ymd_opt(2027, 1, 20)
        );
        assert_eq!(q2.lessons[1].objectives[0].code, "10.4.1.3");
        assert_eq!(q2.lessons[1].objectives[0].description, "знать теорему Виета");
        assert_eq!(q2.lessons[1].adapted_objective, "Карточка-подсказка");
    }

    #[test]
    fn fallback_hours_and_total_without_header() {
        let mut rows = vec![
            header_row(),
            row_xml(&[cell_span(&para_xml("III четверть"), 7)]),
        ];
        for i in 1..=3 {
            rows.push(row_xml(&[
                cell_xml(&para_xml(&i.to_string())),
                cell_xml(&para_xml("Раздел A")),
                cell_xml(&para_xml(&format!("Тема {i}"))),
                cell_xml(&para_xml("8.3.1.1 - цель;")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
            ]));
        }
        let plan = parse_doc(&[], &rows);
        // Без шапки: ceil(3 / 8) = 1, всего — число уроков.
        assert_eq!(plan.quarters.len(), 1);
        assert_eq!(plan.quarters[0].quarter_number, 3);
        assert_eq!(plan.quarters[0].hours_per_week, 1);
        assert_eq!(plan.total_hours, 3);
        assert!(plan.quarters[0].lessons[0].planned_date.is_none());
    }

    #[test]
    fn missing_table_reports_error() {
        let content = crate::infra::docx_read::DocxContent {
            paragraphs: Vec::new(),
            tables: Vec::new(),
        };
        let err = parse_ktp(&content, &params()).unwrap_err();
        assert!(err.contains("таблицы КТП"), "{err}");
    }

    #[test]
    fn bad_academic_year_is_error() {
        let content = crate::infra::docx_read::DocxContent {
            paragraphs: Vec::new(),
            tables: Vec::new(),
        };
        let bad = ImportParams {
            subject_id: "algebra".to_string(),
            grade: 8,
            academic_year: "2026".to_string(),
        };
        let err = parse_ktp(&content, &bad).unwrap_err();
        assert!(err.contains("учебный год"), "{err}");
    }

    #[test]
    fn three_part_code_and_text_without_code_are_kept() {
        let objs = parse_objectives("10.2.1 - знать аксиомы стереометрии;").unwrap();
        assert_eq!(objs.len(), 1);
        assert_eq!(objs[0].code, "10.2.1");
        assert_eq!(objs[0].description, "знать аксиомы стереометрии");
        let objs = parse_objectives("применять аксиомы\n10.2.2 решать задачи").unwrap();
        assert_eq!(objs.len(), 2);
        assert_eq!(objs[0].code, "");
        assert_eq!(objs[0].description, "применять аксиомы");
        assert_eq!(objs[1].code, "10.2.2");
    }

    #[test]
    fn objective_code_with_spaces_is_normalized() {
        let objs = parse_objectives("8. 3.3.1 - усвоить понятие корня;").unwrap();
        assert_eq!(objs.len(), 1);
        assert_eq!(objs[0].code, "8.3.3.1");
        assert_eq!(objs[0].description, "усвоить понятие корня");
    }

    #[test]
    fn grid_objectives_span_two_keeps_date_and_section() {
        // Ячейка целей с gridSpan=2 перекрывает «Адаптированную цель»,
        // дата стоит в своей колонке сетки.
        let rows = vec![
            header_row(),
            row_xml(&[cell_span(&para_xml("1 четверть"), 7)]),
            row_xml(&[
                cell_xml(&para_xml("1")),
                cell_xml(&para_xml("Повторение курса 7 класса")),
                cell_xml(&para_xml("Повторение курса Алгебры 7 класса")),
                cell_span(&para_xml("8.1.2.5 - усвоить понятие корня;"), 2),
                cell_xml(&para_xml("02.09")),
                cell_xml(&para_xml("")),
            ]),
        ];
        let plan = parse_doc(&[], &rows);
        assert_eq!(plan.quarters.len(), 1);
        assert_eq!(plan.quarters[0].lessons.len(), 1);
        let lesson = &plan.quarters[0].lessons[0];
        assert_eq!(lesson.lesson_type, LessonKind::Standard);
        assert_eq!(lesson.section_name, "Повторение курса 7 класса");
        assert_eq!(lesson.topic_title, "Повторение курса Алгебры 7 класса");
        assert_eq!(lesson.objectives.len(), 1);
        assert_eq!(lesson.objectives[0].code, "8.1.2.5");
        // Перекрытая адаптированная цель не дублируется.
        assert!(lesson.adapted_objective.is_empty());
        assert_eq!(
            lesson.planned_date,
            NaiveDate::from_ymd_opt(2026, 9, 2)
        );
    }

    #[test]
    fn empty_objectives_with_section_is_standard() {
        // Без целей, но с разделом — обычный урок своего раздела.
        let rows = vec![
            header_row(),
            row_xml(&[cell_span(&para_xml("1 четверть"), 7)]),
            row_xml(&[
                cell_xml(&para_xml("1")),
                cell_xml(&para_xml("Повторение курса 7 класса")),
                cell_xml(&para_xml("Комплексная диагностическая работа")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("04.09")),
                cell_xml(&para_xml("")),
            ]),
        ];
        let plan = parse_doc(&[], &rows);
        let lesson = &plan.quarters[0].lessons[0];
        assert_eq!(lesson.lesson_type, LessonKind::Standard);
        assert_eq!(lesson.section_name, "Повторение курса 7 класса");
        assert!(lesson.objectives.is_empty());
        assert_eq!(
            lesson.planned_date,
            NaiveDate::from_ymd_opt(2026, 9, 4)
        );
    }

    #[test]
    fn empty_objectives_and_section_is_revision() {
        // Пусты и раздел, и цели — резерв после СОЧ.
        let rows = vec![
            header_row(),
            row_xml(&[cell_span(&para_xml("1 четверть"), 7)]),
            row_xml(&[
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("Повторение материала 1 четверти")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("")),
                cell_xml(&para_xml("07.11")),
                cell_xml(&para_xml("")),
            ]),
        ];
        let plan = parse_doc(&[], &rows);
        let lesson = &plan.quarters[0].lessons[0];
        assert_eq!(lesson.lesson_type, LessonKind::Revision);
        assert_eq!(lesson.section_name, "Повторение");
        assert!(lesson.objectives.is_empty());
    }

    #[test]
    fn cell_at_uses_grid_spans() {
        use crate::infra::docx_read::DocxCell;
        let row = vec![
            DocxCell { text: "a".into(), span: 1 },
            DocxCell { text: "b".into(), span: 2 },
            DocxCell { text: "c".into(), span: 1 },
        ];
        assert_eq!(cell_at(&row, 0).unwrap().text, "a");
        assert_eq!(cell_at(&row, 1).unwrap().text, "b");
        assert_eq!(cell_at(&row, 2).unwrap().text, "b");
        assert_eq!(cell_at(&row, 3).unwrap().text, "c");
        assert!(cell_at(&row, 4).is_none());
    }
}
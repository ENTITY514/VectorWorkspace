//! PDF КСП по форме приказа № 130. Кириллица — встроенный DejaVu Sans.

use printpdf::{
    Color, Line, LinePoint, Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage,
    PdfSaveOptions, Point, Pt, Rgb, TextItem,
};

use crate::domain::ksp::{AssessmentMode, KspDocument, KspStage, StageType};

const PAGE_W: f32 = 297.0;
const PAGE_H: f32 = 210.0;
const MARGIN: f32 = 10.0;
const FS_TITLE: f32 = 13.0;
const FS_HEAD: f32 = 8.0;
const FS_CELL: f32 = 7.0;
const LINE: f32 = 3.0;

fn mm(v: f32) -> Pt {
    Mm(v).into()
}

fn gray(v: f32) -> Color {
    Color::Rgb(Rgb { r: v, g: v, b: v, icc_profile: None })
}

fn line(ops: &mut Vec<Op>, x1: f32, y1: f32, x2: f32, y2: f32) {
    ops.push(Op::SetOutlineColor { col: gray(0.25) });
    ops.push(Op::SetOutlineThickness { pt: Pt(0.4) });
    ops.push(Op::DrawLine {
        line: Line {
            points: vec![
                LinePoint { p: Point { x: mm(x1), y: mm(y1) }, bezier: false },
                LinePoint { p: Point { x: mm(x2), y: mm(y2) }, bezier: false },
            ],
            is_closed: false,
        },
    });
}

fn fill_rect(ops: &mut Vec<Op>, x: f32, y: f32, w: f32, h: f32, color: Color) {
    ops.push(Op::SetFillColor { col: color });
    ops.push(Op::DrawRectangle {
        rectangle: printpdf::Rect {
            x: mm(x),
            y: mm(y),
            width: mm(w),
            height: mm(h),
            mode: Some(printpdf::PaintMode::Fill),
            winding_order: None,
        },
    });
}

fn text(ops: &mut Vec<Op>, font: &PdfFontHandle, x: f32, y: f32, size: f32, s: &str, color: Color) {
    if s.is_empty() {
        return;
    }
    ops.push(Op::StartTextSection);
    ops.push(Op::SetFillColor { col: color });
    ops.push(Op::SetFont { font: font.clone(), size: Pt(size) });
    ops.push(Op::SetTextCursor { pos: Point { x: mm(x), y: mm(y) } });
    ops.push(Op::ShowText { items: vec![TextItem::Text(s.to_string())] });
    ops.push(Op::EndTextSection);
}

fn text_width_mm(s: &str, size: f32) -> f32 {
    s.chars().count() as f32 * size * 0.52 * 0.3528
}

fn wrap(s: &str, size: f32, max_mm: f32) -> Vec<String> {
    let mut out = Vec::new();
    for raw in s.split('\n') {
        if raw.is_empty() {
            out.push(String::new());
            continue;
        }
        if text_width_mm(raw, size) <= max_mm {
            out.push(raw.to_string());
            continue;
        }
        let mut current = String::new();
        for word in raw.split_whitespace() {
            let candidate = if current.is_empty() { word.to_string() } else { format!("{current} {word}") };
            if text_width_mm(&candidate, size) <= max_mm {
                current = candidate;
            } else {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
                current = word.to_string();
            }
        }
        if !current.is_empty() {
            out.push(current);
        }
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

fn format_date(raw: &Option<String>) -> String {
    let Some(s) = raw.as_ref() else { return "—".into() };
    let date = s.split(['T', ' ']).next().unwrap_or(s);
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() >= 3 {
        format!("{}.{}.{}", parts[2], parts[1], parts[0])
    } else {
        s.clone()
    }
}

fn assess_text(s: &KspStage) -> String {
    let mode = match s.assessment.mode {
        AssessmentMode::Summative => "Суммативное",
        AssessmentMode::Formative => "Формативное",
        AssessmentMode::None => "",
    };
    let desc = s
        .assessment
        .descriptors
        .iter()
        .map(|d| {
            if let Some(p) = d.points {
                format!("• {} ({} б.)", d.text, p)
            } else {
                format!("• {}", d.text)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    [mode.to_string(), desc].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join("\n")
}

fn stage_title(t: StageType, minutes: i64) -> String {
    format!("{} ({} мин)", t.title_ru(), minutes)
}

struct Row {
    cells: Vec<String>,
    widths: Vec<f32>,
    fill: Option<Color>,
    bold: bool,
}

fn row_height(row: &Row) -> f32 {
    let mut lines = 1usize;
    for (cell, w) in row.cells.iter().zip(row.widths.iter()) {
        lines = lines.max(wrap(cell, FS_CELL, (w - 2.5).max(8.0)).len());
    }
    (lines as f32 * LINE + 2.6).max(7.0)
}

fn draw_row(ops: &mut Vec<Op>, font: &PdfFontHandle, row: &Row, x: f32, y_top: f32, usable: f32) -> f32 {
    let h = row_height(row);
    let y = y_top - h;
    if let Some(c) = row.fill.clone() {
        fill_rect(ops, x, y, usable, h, c);
    }
    let mut cx = x;
    for (i, cell) in row.cells.iter().enumerate() {
        let w = row.widths[i];
        let lines = wrap(cell, FS_CELL, (w - 2.5).max(8.0));
        for (n, line) in lines.iter().enumerate() {
            text(
                ops,
                font,
                cx + 1.2,
                y + h - 3.4 - n as f32 * LINE,
                if row.bold { FS_HEAD } else { FS_CELL },
                line,
                gray(0.08),
            );
        }
        line(ops, cx, y, cx, y + h);
        cx += w;
    }
    line(ops, x + usable, y, x + usable, y + h);
    line(ops, x, y, x + usable, y);
    line(ops, x, y + h, x + usable, y + h);
    h
}

fn flush_page(pages: &mut Vec<PdfPage>, ops: Vec<Op>) {
    pages.push(PdfPage::new(Mm(PAGE_W), Mm(PAGE_H), ops));
}

pub fn build(doc: &KspDocument) -> Result<Vec<u8>, String> {
    let font = ParsedFont::from_bytes(dejavu::sans::regular(), 0, &mut Vec::new())
        .ok_or_else(|| "не удалось разобрать встроенный шрифт".to_string())?;
    let mut pdf = PdfDocument::new("Краткосрочный план урока");
    let font_id = pdf.add_font(&font);
    let handle = PdfFontHandle::External(font_id);

    let usable = PAGE_W - 2.0 * MARGIN;
    let label_w = 52.0;
    let value_w = usable - label_w;
    let cols = [48.0, 68.0, 68.0, 52.0, usable - 48.0 - 68.0 - 68.0 - 52.0];
    let h = &doc.content.header;
    let goals = h
        .learning_objectives
        .iter()
        .map(|o| format!("{} {}", o.code, o.text))
        .collect::<Vec<_>>()
        .join("\n");
    let lesson_goal = [&h.lesson_goals.all, &h.lesson_goals.most, &h.lesson_goals.some]
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");

    let mut rows = vec![
        meta("Раздел", &h.section, label_w, value_w),
        meta("ФИО педагога", &empty(&h.teacher_name), label_w, value_w),
        meta("Дата", &format_date(&h.planned_date), label_w, value_w),
        meta("Класс", &format!("«{}»", empty(&doc.class_name)), label_w, value_w),
        meta("Тема урока", &h.topic, label_w, value_w),
        meta("Цели обучения в соответствии с учебной программой", &empty(&goals), label_w, value_w),
        meta("Цель урока", &empty(&lesson_goal), label_w, value_w),
        meta("Воспитательная задача", &empty(&h.values_component.text), label_w, value_w),
        Row {
            cells: vec![
                "Этап урока / время".into(),
                "Действия педагога".into(),
                "Действия учеников".into(),
                "Оценивание".into(),
                "Ресурсы".into(),
            ],
            widths: cols.to_vec(),
            fill: Some(Color::Rgb(Rgb { r: 0.90, g: 0.90, b: 0.92, icc_profile: None })),
            bold: true,
        },
    ];

    for s in &doc.content.stages {
        rows.push(Row {
            cells: vec![
                stage_title(s.stage_type, s.duration_minutes),
                s.teacher_actions.clone(),
                s.student_actions.clone(),
                assess_text(s),
                s.resources.iter().map(|r| r.display.as_str()).collect::<Vec<_>>().join(", "),
            ],
            widths: cols.to_vec(),
            fill: None,
            bold: false,
        });
    }

    let hw = [
        doc.content.homework.text.as_str(),
        if doc.content.homework.check_method.trim().is_empty() {
            ""
        } else {
            doc.content.homework.check_method.as_str()
        },
    ];
    let hw_text = if hw[1].is_empty() {
        empty(&hw[0].to_string())
    } else {
        format!("{}\nПроверка: {}", empty(&hw[0].to_string()), hw[1])
    };
    rows.push(Row {
        cells: vec!["Домашнее задание".into(), hw_text],
        widths: vec![cols[0], usable - cols[0]],
        fill: Some(Color::Rgb(Rgb { r: 0.95, g: 0.95, b: 0.96, icc_profile: None })),
        bold: false,
    });

    let mut pages = Vec::new();
    let mut ops = Vec::new();
    let mut y = PAGE_H - MARGIN;
    text(&mut ops, &handle, MARGIN, y - 5.0, FS_TITLE, "Краткосрочный план урока", gray(0.05));
    y -= 9.0;
    line(&mut ops, MARGIN, y, MARGIN + usable, y);
    y -= 2.0;

    for row in &rows {
        let hgt = row_height(row);
        if y - hgt < MARGIN {
            flush_page(&mut pages, std::mem::take(&mut ops));
            y = PAGE_H - MARGIN;
        }
        y -= draw_row(&mut ops, &handle, row, MARGIN, y, usable);
    }
    if !ops.is_empty() {
        flush_page(&mut pages, ops);
    }

    Ok(pdf.with_pages(pages).save(&PdfSaveOptions::default(), &mut Vec::new()))
}

fn empty(s: &str) -> String {
    if s.trim().is_empty() { "—".into() } else { s.to_string() }
}

fn meta(label: &str, value: &str, label_w: f32, value_w: f32) -> Row {
    Row {
        cells: vec![label.into(), value.into()],
        widths: vec![label_w, value_w],
        fill: Some(Color::Rgb(Rgb { r: 0.96, g: 0.96, b: 0.97, icc_profile: None })),
        bold: false,
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::invariants::LessonKind;
    use crate::domain::ksp::{draft_from_template, KspDocument, KspHeader, KspStatus, LearningObjectiveRef, LessonGoals, ValuesComponent};

    #[test]
    fn builds_non_empty_pdf() {
        let header = KspHeader {
            section: "Раздел".into(),
            topic: "Тема".into(),
            learning_objectives: vec![LearningObjectiveRef { code: "8.1.1".into(), text: "цель".into() }],
            planned_date: Some("2026-01-21".into()),
            class_name: "8".into(),
            teacher_name: "Учитель".into(),
            lesson_goals: LessonGoals { all: "цель".into(), most: String::new(), some: String::new() },
            values_component: ValuesComponent { value_ids: vec![], text: "труд".into() },
            success_criteria: vec![],
        };
        let doc = KspDocument {
            id: crate::domain::ids::KspId::new(),
            ktp_lesson_id: "l".into(),
            ktp_plan_id: "p".into(),
            teacher_id: "t".into(),
            class_name: "8".into(),
            status: KspStatus::Draft,
            language: "ru".into(),
            schema_version: 1,
            is_approved: false,
            content: draft_from_template(LessonKind::Standard, header, 45),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let bytes = super::build(&doc).expect("pdf");
        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 1000);
    }
}

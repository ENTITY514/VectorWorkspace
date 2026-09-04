//! Выгрузка расписания в PDF.
//!
//! Шрифт DejaVu Sans встроен в файл: стандартные шрифты PDF не содержат
//! кириллицы, а полагаться на шрифты машины, где документ откроют, нельзя.
//! Лицензия DejaVu это разрешает.
//!
//! Каждая таблица рисуется вручную — линиями и текстом: готовой вёрстки
//! таблиц в printpdf нет, зато полный контроль над шириной колонок и
//! переносами, а расписание всегда одной структуры.

use printpdf::{
    Color, Line, LinePoint, Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage,
    PdfSaveOptions, Point, Pt, Rgb, TextItem,
};

use super::schedule_report::{
    cell_for_class, cell_for_teacher, ReportData, ReportLesson, ReportScope, DAY_SHORT,
};

/// Альбомная A4 — расписание шире, чем выше.
const PAGE_W: f32 = 297.0;
const PAGE_H: f32 = 210.0;
const MARGIN: f32 = 10.0;

const FS_TITLE: f32 = 14.0;
const FS_SUB: f32 = 8.5;
const FS_HEAD: f32 = 9.0;
const FS_CELL: f32 = 7.0;
/// Межстрочный интервал внутри ячейки.
const LINE_STEP: f32 = 3.1;

fn mm(v: f32) -> Pt {
    Mm(v).into()
}

fn gray(v: f32) -> Color {
    Color::Rgb(Rgb { r: v, g: v, b: v, icc_profile: None })
}

fn accent() -> Color {
    Color::Rgb(Rgb { r: 0.31, g: 0.275, b: 0.898, icc_profile: None })
}

/// Горизонтальная или вертикальная линия.
fn line(ops: &mut Vec<Op>, x1: f32, y1: f32, x2: f32, y2: f32, width: f32, color: Color) {
    ops.push(Op::SetOutlineColor { col: color });
    ops.push(Op::SetOutlineThickness { pt: Pt(width) });
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

/// Грубая оценка ширины строки в миллиметрах.
///
/// Точные метрики DejaVu считать не требуется: нужно лишь понять, помещается
/// ли строка в колонку, и при необходимости перенести её по словам.
fn text_width_mm(s: &str, size: f32) -> f32 {
    s.chars().count() as f32 * size * 0.52 * 0.3528
}

/// Переносит текст по словам под ширину колонки.
fn wrap(s: &str, size: f32, max_mm: f32) -> Vec<String> {
    let mut out = Vec::new();
    for raw_line in s.split('\n') {
        if text_width_mm(raw_line, size) <= max_mm {
            out.push(raw_line.to_string());
            continue;
        }
        let mut current = String::new();
        for word in raw_line.split_whitespace() {
            let candidate = if current.is_empty() {
                word.to_string()
            } else {
                format!("{current} {word}")
            };
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
    out
}

struct Table<'a> {
    /// Подписи колонок после первой (первая — номер урока).
    columns: Vec<String>,
    /// Содержимое: `[урок][колонка]`.
    cells: Vec<Vec<String>>,
    title: String,
    subtitle: String,
    data: &'a ReportData,
}

/// Рисует одну страницу-таблицу.
fn render_table(font: &PdfFontHandle, t: &Table) -> PdfPage {
    let mut ops = Vec::new();

    let top = PAGE_H - MARGIN;
    text(&mut ops, font, MARGIN, top - 5.0, FS_TITLE, &t.title, gray(0.05));
    text(&mut ops, font, MARGIN, top - 10.0, FS_SUB, &t.subtitle, gray(0.45));

    let table_top = top - 15.0;
    let table_bottom = MARGIN + 6.0;
    let rows = t.cells.len().max(1);

    let head_h = 7.0;
    let body_h = (table_top - head_h - table_bottom).max(10.0);
    let row_h = body_h / rows as f32;

    let num_w = 9.0;
    let usable = PAGE_W - 2.0 * MARGIN - num_w;
    let col_w = usable / t.columns.len().max(1) as f32;

    // Шапка
    let head_y = table_top - head_h;
    ops.push(Op::SetFillColor { col: accent() });
    ops.push(Op::DrawRectangle {
        rectangle: printpdf::Rect {
            x: mm(MARGIN),
            y: mm(head_y),
            width: mm(PAGE_W - 2.0 * MARGIN),
            height: mm(head_h),
            mode: Some(printpdf::PaintMode::Fill),
            winding_order: None,
        },
    });
    text(&mut ops, font, MARGIN + 2.0, head_y + 2.3, FS_HEAD, "Урок", gray(1.0));
    for (i, c) in t.columns.iter().enumerate() {
        let x = MARGIN + num_w + i as f32 * col_w + 1.5;
        text(&mut ops, font, x, head_y + 2.3, FS_HEAD, c, gray(1.0));
    }

    // Тело
    for (r, row) in t.cells.iter().enumerate() {
        let y_top = head_y - r as f32 * row_h;
        let y_bottom = y_top - row_h;

        // Чередование фона делает длинные таблицы читаемыми.
        if r % 2 == 1 {
            ops.push(Op::SetFillColor { col: gray(0.965) });
            ops.push(Op::DrawRectangle {
                rectangle: printpdf::Rect {
                    x: mm(MARGIN),
                    y: mm(y_bottom),
                    width: mm(PAGE_W - 2.0 * MARGIN),
                    height: mm(row_h),
                    mode: Some(printpdf::PaintMode::Fill),
                    winding_order: None,
                },
            });
        }

        line(&mut ops, MARGIN, y_bottom, PAGE_W - MARGIN, y_bottom, 0.3, gray(0.75));
        text(&mut ops, font, MARGIN + 3.0, y_top - row_h / 2.0 - 1.0, FS_HEAD, &(r + 1).to_string(), gray(0.2));

        for (c, cell) in row.iter().enumerate() {
            if cell.is_empty() {
                continue;
            }
            let x = MARGIN + num_w + c as f32 * col_w + 1.5;
            let lines = wrap(cell, FS_CELL, col_w - 3.0);
            // Текст выравнивается по верху ячейки: так строки разных ячеек
            // одного урока стоят на одной высоте.
            let mut y = y_top - 3.2;
            for ln in lines.iter().take(4) {
                if y < y_bottom + 0.5 {
                    break;
                }
                text(&mut ops, font, x, y, FS_CELL, ln, gray(0.15));
                y -= LINE_STEP;
            }
        }
    }

    // Вертикальные разделители и рамка
    line(&mut ops, MARGIN + num_w, table_top - head_h, MARGIN + num_w, table_bottom, 0.3, gray(0.75));
    for i in 1..t.columns.len() {
        let x = MARGIN + num_w + i as f32 * col_w;
        line(&mut ops, x, table_top - head_h, x, table_bottom, 0.3, gray(0.75));
    }
    line(&mut ops, MARGIN, table_top - head_h, PAGE_W - MARGIN, table_top - head_h, 0.4, gray(0.6));
    line(&mut ops, MARGIN, table_bottom, PAGE_W - MARGIN, table_bottom, 0.4, gray(0.6));
    line(&mut ops, MARGIN, table_top - head_h, MARGIN, table_bottom, 0.4, gray(0.6));
    line(&mut ops, PAGE_W - MARGIN, table_top - head_h, PAGE_W - MARGIN, table_bottom, 0.4, gray(0.6));

    text(
        &mut ops,
        font,
        MARGIN,
        MARGIN - 1.0,
        6.5,
        &format!("{} · {}", t.data.school_name, t.data.variant_name),
        gray(0.55),
    );

    PdfPage::new(Mm(PAGE_W), Mm(PAGE_H), ops)
}

fn class_table<'a>(data: &'a ReportData, class_id: &str) -> Table<'a> {
    let by_slot = data.by_class(class_id);
    let cells = (0..data.grid.periods_per_day)
        .map(|p| {
            (0..data.grid.days)
                .map(|d| by_slot.get(&(d, p)).map(|ls| cell_for_class(ls)).unwrap_or_default())
                .collect()
        })
        .collect();
    Table {
        columns: (0..data.grid.days)
            .map(|d| DAY_SHORT.get(d as usize).copied().unwrap_or("").to_string())
            .collect(),
        cells,
        title: format!("Расписание класса {}", data.class_title(class_id)),
        subtitle: format!("{} · {}", data.school_name, data.variant_name),
        data,
    }
}

fn teacher_table<'a>(data: &'a ReportData, teacher_id: &str) -> Table<'a> {
    let by_slot = data.by_teacher(teacher_id);
    let cells = (0..data.grid.periods_per_day)
        .map(|p| {
            (0..data.grid.days)
                .map(|d| by_slot.get(&(d, p)).map(|ls| cell_for_teacher(ls)).unwrap_or_default())
                .collect()
        })
        .collect();
    Table {
        columns: (0..data.grid.days)
            .map(|d| DAY_SHORT.get(d as usize).copied().unwrap_or("").to_string())
            .collect(),
        cells,
        title: format!("Расписание — {}", data.teacher_title(teacher_id)),
        subtitle: format!("Занятий в неделю: {}", by_slot.len()),
        data,
    }
}

/// Сводная сетка. Классов бывает под тридцать, поэтому они режутся на
/// страницы: втиснуть все в ширину листа — значит сделать документ нечитаемым.
fn overview_tables<'a>(data: &'a ReportData) -> Vec<Table<'a>> {
    const MAX_COLS: usize = 9;
    let classes = data.non_empty_classes();
    if classes.is_empty() {
        return Vec::new();
    }

    let mut index: std::collections::HashMap<(&str, i64, i64), Vec<&ReportLesson>> =
        std::collections::HashMap::new();
    for l in &data.lessons {
        index.entry((l.class_id.as_str(), l.day, l.period)).or_default().push(l);
    }

    let chunks: Vec<&[(String, String)]> = classes.chunks(MAX_COLS).collect();
    let total = chunks.len();
    let mut tables = Vec::new();

    for d in 0..data.grid.days {
        for (n, chunk) in chunks.iter().enumerate() {
            let cells = (0..data.grid.periods_per_day)
                .map(|p| {
                    chunk
                        .iter()
                        .map(|(cid, _)| {
                            index
                                .get(&(cid.as_str(), d, p))
                                .map(|ls| cell_for_class(ls))
                                .unwrap_or_default()
                        })
                        .collect()
                })
                .collect();
            let day = DAY_SHORT.get(d as usize).copied().unwrap_or("");
            tables.push(Table {
                columns: chunk.iter().map(|(_, t)| t.clone()).collect(),
                cells,
                title: format!("Расписание — {day}"),
                subtitle: if total > 1 {
                    format!("Классы {} из {}", n + 1, total)
                } else {
                    format!("{} · {}", data.school_name, data.variant_name)
                },
                data,
            });
        }
    }
    tables
}

/// Собирает PDF по выбранному срезу.
pub fn build(data: &ReportData, scope: &ReportScope) -> Result<Vec<u8>, String> {
    let font = ParsedFont::from_bytes(dejavu::sans::regular(), 0, &mut Vec::new())
        .ok_or_else(|| "не удалось разобрать встроенный шрифт".to_string())?;
    let mut pdf = PdfDocument::new(&scope.file_stem(data));
    let font_id = pdf.add_font(&font);
    let handle = PdfFontHandle::External(font_id);

    let tables: Vec<Table> = match scope {
        ReportScope::All => overview_tables(data),
        ReportScope::Class { id } => vec![class_table(data, id)],
        ReportScope::Teacher { id } => vec![teacher_table(data, id)],
        ReportScope::AllClasses => data
            .non_empty_classes()
            .iter()
            .map(|(id, _)| class_table(data, id))
            .collect(),
        ReportScope::AllTeachers => data
            .non_empty_teachers()
            .iter()
            .map(|(id, _)| teacher_table(data, id))
            .collect(),
    };

    if tables.is_empty() {
        return Err("в выбранном варианте нет ни одного урока".to_string());
    }

    let pages: Vec<PdfPage> = tables.iter().map(|t| render_table(&handle, t)).collect();
    Ok(pdf
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::schedule::time_grid::TimeGrid;

    fn sample() -> ReportData {
        ReportData {
            school_name: "Школа №1".into(),
            variant_name: "4 четверть".into(),
            grid: TimeGrid { days: 5, periods_per_day: 7, shift_boundary_period: None },
            lessons: vec![ReportLesson {
                class_id: "7a".into(), class_title: "7а".into(),
                subject: "Алгебра".into(), teacher: "Иванова Мария".into(),
                teacher_id: "ivanova".into(), room: "Каб. 12".into(),
                day: 0, period: 1, subgroup: None, is_joint: false,
            }],
            classes: vec![("7a".into(), "7а".into())],
            teachers: vec![("ivanova".into(), "Иванова Мария".into())],
        }
    }

    #[test]
    fn builds_all_scopes() {
        let d = sample();
        for scope in [
            ReportScope::All,
            ReportScope::AllClasses,
            ReportScope::AllTeachers,
            ReportScope::Class { id: "7a".into() },
            ReportScope::Teacher { id: "ivanova".into() },
        ] {
            let bytes = build(&d, &scope).unwrap_or_else(|e| panic!("{scope:?}: {e}"));
            assert_eq!(&bytes[..5], b"%PDF-", "срез {scope:?} дал не PDF");
            assert!(bytes.len() > 5000, "срез {scope:?} подозрительно мал");
        }
    }

    #[test]
    fn empty_schedule_reports_error() {
        let mut d = sample();
        d.lessons.clear();
        assert!(build(&d, &ReportScope::All).is_err());
    }

    #[test]
    fn wrap_splits_by_words_and_keeps_short_lines() {
        let long = "Изобразительное искусство и художественный труд";
        let lines = wrap(long, FS_CELL, 20.0);
        assert!(lines.len() > 1, "длинная строка должна переноситься");
        assert!(lines.iter().all(|l| text_width_mm(l, FS_CELL) <= 20.0 || !l.contains(' ')));

        // Готовые переносы сохраняются: предмет, учитель и кабинет — разные строки.
        assert_eq!(wrap("Алгебра\nИванова М.", FS_CELL, 50.0).len(), 2);
    }
}

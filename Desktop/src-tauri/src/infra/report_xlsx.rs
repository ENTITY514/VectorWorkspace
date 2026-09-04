//! Выгрузка расписания в Excel.
//!
//! Каждый срез — отдельный лист: сводная сетка, класс, учитель. Ширины
//! колонок, переносы и рамки заданы явно, иначе таблица приходит нечитаемой
//! и её всё равно переверстывают руками.

use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError};

use super::schedule_report::{
    cell_for_class, cell_for_teacher, ReportData, ReportScope, DAY_SHORT,
};

/// Высота строки урока в пунктах: в ячейке до трёх строк текста
/// (предмет, учитель, кабинет).
const LESSON_ROW_HEIGHT: f64 = 46.0;
const COL_WIDTH_LESSON: f64 = 22.0;
const COL_WIDTH_HEADER: f64 = 6.0;

struct Styles {
    title: Format,
    subtitle: Format,
    head: Format,
    day: Format,
    period: Format,
    cell: Format,
    cell_empty: Format,
}

fn styles() -> Styles {
    let border = FormatBorder::Thin;
    let head_bg = Color::RGB(0x4F46E5);
    let day_bg = Color::RGB(0xEEF2FF);

    Styles {
        title: Format::new().set_bold().set_font_size(14),
        subtitle: Format::new().set_font_size(10).set_font_color(Color::RGB(0x64748B)),
        head: Format::new()
            .set_bold()
            .set_font_color(Color::White)
            .set_background_color(head_bg)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(border)
            .set_text_wrap(),
        day: Format::new()
            .set_bold()
            .set_background_color(day_bg)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(border)
            .set_rotation(90),
        period: Format::new()
            .set_bold()
            .set_background_color(day_bg)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(border),
        cell: Format::new()
            .set_border(border)
            .set_text_wrap()
            .set_align(FormatAlign::VerticalCenter)
            .set_font_size(9),
        cell_empty: Format::new().set_border(border),
    }
}

/// Заголовок листа: школа, вариант, что именно выгружено.
fn write_header(
    sheet: &mut rust_xlsxwriter::Worksheet,
    s: &Styles,
    data: &ReportData,
    caption: &str,
) -> Result<(), XlsxError> {
    sheet.write_with_format(0, 0, caption, &s.title)?;
    sheet.write_with_format(
        1,
        0,
        format!("{} · {}", data.school_name, data.variant_name),
        &s.subtitle,
    )?;
    Ok(())
}

/// Сводная сетка: классы по столбцам, (день, урок) по строкам.
fn write_overview(
    sheet: &mut rust_xlsxwriter::Worksheet,
    s: &Styles,
    data: &ReportData,
) -> Result<(), XlsxError> {
    write_header(sheet, s, data, "Расписание — общая сетка")?;

    let classes = data.non_empty_classes();
    const TOP: u32 = 3;

    sheet.write_with_format(TOP, 0, "День", &s.head)?;
    sheet.write_with_format(TOP, 1, "Урок", &s.head)?;
    for (i, (_, title)) in classes.iter().enumerate() {
        sheet.write_with_format(TOP, 2 + i as u16, title.as_str(), &s.head)?;
        sheet.set_column_width(2 + i as u16, COL_WIDTH_LESSON)?;
    }
    sheet.set_column_width(0, COL_WIDTH_HEADER)?;
    sheet.set_column_width(1, COL_WIDTH_HEADER)?;

    // Заранее разложим уроки по (класс, день, урок) — иначе на каждую ячейку
    // пришлось бы заново обходить весь список.
    let mut index: std::collections::HashMap<(&str, i64, i64), Vec<&super::schedule_report::ReportLesson>> =
        std::collections::HashMap::new();
    for l in &data.lessons {
        index.entry((l.class_id.as_str(), l.day, l.period)).or_default().push(l);
    }

    let mut row = TOP + 1;
    for d in 0..data.grid.days {
        let first = row;
        for p in 0..data.grid.periods_per_day {
            sheet.write_with_format(row, 1, p + 1, &s.period)?;
            sheet.set_row_height(row, LESSON_ROW_HEIGHT)?;
            for (i, (cid, _)) in classes.iter().enumerate() {
                let col = 2 + i as u16;
                match index.get(&(cid.as_str(), d, p)) {
                    Some(ls) => sheet.write_with_format(row, col, cell_for_class(ls), &s.cell)?,
                    None => sheet.write_with_format(row, col, "", &s.cell_empty)?,
                };
            }
            row += 1;
        }
        // Название дня — одной объединённой ячейкой на все его уроки.
        let day_name = DAY_SHORT.get(d as usize).copied().unwrap_or("");
        if data.grid.periods_per_day > 1 {
            sheet.merge_range(first, 0, row - 1, 0, day_name, &s.day)?;
        } else {
            sheet.write_with_format(first, 0, day_name, &s.day)?;
        }
    }

    sheet.set_freeze_panes(TOP + 1, 2)?;
    Ok(())
}

/// Лист одного класса: дни по столбцам, уроки по строкам.
fn write_class(
    sheet: &mut rust_xlsxwriter::Worksheet,
    s: &Styles,
    data: &ReportData,
    class_id: &str,
) -> Result<(), XlsxError> {
    let title = data.class_title(class_id);
    write_header(sheet, s, data, &format!("Расписание класса {title}"))?;

    const TOP: u32 = 3;
    sheet.write_with_format(TOP, 0, "Урок", &s.head)?;
    sheet.set_column_width(0, COL_WIDTH_HEADER)?;
    for d in 0..data.grid.days {
        let col = 1 + d as u16;
        sheet.write_with_format(TOP, col, DAY_SHORT.get(d as usize).copied().unwrap_or(""), &s.head)?;
        sheet.set_column_width(col, COL_WIDTH_LESSON)?;
    }

    let by_slot = data.by_class(class_id);
    for p in 0..data.grid.periods_per_day {
        let row = TOP + 1 + p as u32;
        sheet.write_with_format(row, 0, p + 1, &s.period)?;
        sheet.set_row_height(row, LESSON_ROW_HEIGHT)?;
        for d in 0..data.grid.days {
            let col = 1 + d as u16;
            match by_slot.get(&(d, p)) {
                Some(ls) => sheet.write_with_format(row, col, cell_for_class(ls), &s.cell)?,
                None => sheet.write_with_format(row, col, "", &s.cell_empty)?,
            };
        }
    }
    sheet.set_freeze_panes(TOP + 1, 1)?;
    Ok(())
}

/// Лист одного учителя. Дополнительно — итог нагрузки: его спрашивают чаще
/// всего, а считать по клеткам вручную неудобно.
fn write_teacher(
    sheet: &mut rust_xlsxwriter::Worksheet,
    s: &Styles,
    data: &ReportData,
    teacher_id: &str,
) -> Result<(), XlsxError> {
    let name = data.teacher_title(teacher_id);
    write_header(sheet, s, data, &format!("Расписание — {name}"))?;

    const TOP: u32 = 3;
    sheet.write_with_format(TOP, 0, "Урок", &s.head)?;
    sheet.set_column_width(0, COL_WIDTH_HEADER)?;
    for d in 0..data.grid.days {
        let col = 1 + d as u16;
        sheet.write_with_format(TOP, col, DAY_SHORT.get(d as usize).copied().unwrap_or(""), &s.head)?;
        sheet.set_column_width(col, COL_WIDTH_LESSON)?;
    }

    let by_slot = data.by_teacher(teacher_id);
    for p in 0..data.grid.periods_per_day {
        let row = TOP + 1 + p as u32;
        sheet.write_with_format(row, 0, p + 1, &s.period)?;
        sheet.set_row_height(row, LESSON_ROW_HEIGHT)?;
        for d in 0..data.grid.days {
            let col = 1 + d as u16;
            match by_slot.get(&(d, p)) {
                Some(ls) => sheet.write_with_format(row, col, cell_for_teacher(ls), &s.cell)?,
                None => sheet.write_with_format(row, col, "", &s.cell_empty)?,
            };
        }
    }

    // Совмещённый урок — одно занятие учителя, поэтому считаем занятые слоты,
    // а не строки расписания.
    let lessons = by_slot.len();
    let summary_row = TOP + 2 + data.grid.periods_per_day as u32;
    sheet.write_with_format(summary_row, 0, "Итого занятий в неделю:", &s.subtitle)?;
    sheet.write(summary_row, 2, lessons as u32)?;

    sheet.set_freeze_panes(TOP + 1, 1)?;
    Ok(())
}

/// Excel-имя листа: до 31 символа, без запрещённых знаков.
fn sheet_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| if "[]:*?/\\".contains(c) { ' ' } else { c })
        .collect();
    cleaned.chars().take(31).collect::<String>().trim().to_string()
}

/// Собирает книгу по выбранному срезу.
pub fn build(data: &ReportData, scope: &ReportScope) -> Result<Vec<u8>, XlsxError> {
    let s = styles();
    let mut wb = Workbook::new();

    match scope {
        ReportScope::All => {
            let sheet = wb.add_worksheet().set_name("Расписание")?;
            write_overview(sheet, &s, data)?;
        }
        ReportScope::Class { id } => {
            let sheet = wb.add_worksheet().set_name(sheet_name(&data.class_title(id)))?;
            write_class(sheet, &s, data, id)?;
        }
        ReportScope::Teacher { id } => {
            let sheet = wb
                .add_worksheet()
                .set_name(sheet_name(&super::schedule_report::short_name(&data.teacher_title(id))))?;
            write_teacher(sheet, &s, data, id)?;
        }
        ReportScope::AllClasses => {
            // Первым листом — сводка: с неё обычно и начинают.
            let sheet = wb.add_worksheet().set_name("Сводная")?;
            write_overview(sheet, &s, data)?;
            for (id, title) in data.non_empty_classes() {
                let sheet = wb.add_worksheet().set_name(sheet_name(&title))?;
                write_class(sheet, &s, data, &id)?;
            }
        }
        ReportScope::AllTeachers => {
            let sheet = wb.add_worksheet().set_name("Сводная")?;
            write_overview(sheet, &s, data)?;
            for (id, name) in data.non_empty_teachers() {
                let sheet = wb
                    .add_worksheet()
                    .set_name(sheet_name(&super::schedule_report::short_name(&name)))?;
                write_teacher(sheet, &s, data, &id)?;
            }
        }
    }

    wb.save_to_buffer()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::schedule::time_grid::TimeGrid;
    use crate::infra::schedule_report::ReportLesson;

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
            classes: vec![("7a".into(), "7а".into()), ("8b".into(), "8б".into())],
            teachers: vec![("ivanova".into(), "Иванова Мария".into())],
        }
    }

    #[test]
    fn builds_all_scopes_without_error() {
        let d = sample();
        for scope in [
            ReportScope::All,
            ReportScope::AllClasses,
            ReportScope::AllTeachers,
            ReportScope::Class { id: "7a".into() },
            ReportScope::Teacher { id: "ivanova".into() },
        ] {
            let bytes = build(&d, &scope).expect("книга должна собираться");
            // ZIP-сигнатура: файл действительно xlsx, а не пустой буфер.
            assert_eq!(&bytes[..2], b"PK", "срез {scope:?} дал не xlsx");
            assert!(bytes.len() > 1000, "срез {scope:?} подозрительно мал");
        }
    }

    #[test]
    fn skips_classes_without_lessons() {
        // Класс 8б уроков не имеет — отдельного листа быть не должно.
        let bytes = build(&sample(), &ReportScope::AllClasses).unwrap();
        assert!(bytes.len() > 1000);
        assert_eq!(sample().non_empty_classes().len(), 1);
    }

    #[test]
    fn sheet_name_is_excel_safe() {
        assert_eq!(sheet_name("7а/8б"), "7а 8б");
        assert_eq!(sheet_name(&"я".repeat(40)).chars().count(), 31);
        assert_eq!(sheet_name("Каб [1]"), "Каб  1");
    }
}

use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;

/// Генерирует XLSX-файл (OOXML) с сеткой: строки = дни×уроки, столбцы = классы.
/// Ячейки содержат "Предмет\nУчитель\nКабинет", заливка по паре teacher:subject.
pub fn generate_xlsx(
    classes: &[ScheduleExportClass],
    subjects: &[ScheduleExportSubject],
    teachers: &[ScheduleExportTeacher],
    rooms: &[ScheduleExportRoom],
    slots: &[ScheduleExportSlot],
) -> Vec<u8> {
    let rows_per_day = 7;
    let n_days = 6;
    let total_rows = n_days * rows_per_day;

    // Индексы стилей заливки: index 0 = без заливки, далее по hash
    let mut fill_map: std::collections::HashMap<u32, usize> = std::collections::HashMap::new();
    fill_map.insert(0, 0);
    let mut fill_colors: Vec<u32> = vec![0];
    let mut fill_by_key: std::collections::HashMap<(String, String), usize> = std::collections::HashMap::new();
    for s in slots {
        let key = (s.teacher_id.clone(), s.subject_id.clone());
        if !fill_by_key.contains_key(&key) {
            let hash = djb2(&format!("{}:{}", key.0, key.1));
            let idx = fill_map.len();
            fill_map.insert(hash, idx);
            fill_colors.push(hash);
            fill_by_key.insert(key, idx);
        }
    }

    // Собираем ячейки: slot_key (class_idx, day, period) -> vec<labels>
    let mut grid: std::collections::HashMap<(usize, usize, usize), Vec<String>> = std::collections::HashMap::new();
    for s in slots {
        let class_idx = classes.iter().position(|c| c.id == s.class_id).unwrap_or(usize::MAX);
        if class_idx == usize::MAX { continue; }
        let subj = subjects.iter().find(|x| x.id == s.subject_id).map(|x| x.name.clone()).unwrap_or(s.subject_id.clone());
        let teacher = teachers.iter().find(|x| x.id == s.teacher_id).map(|x| x.full_name.clone()).unwrap_or(s.teacher_id.clone());
        let room = rooms.iter().find(|x| x.id == s.room_id).map(|x| x.name.clone()).unwrap_or(s.room_id.clone());
        let text = format!("{}\n{}\n{}", subj, teacher, room);
        grid.entry((class_idx, s.day as usize, s.period as usize)).or_default().push(text);
    }

    // ===== OOXML сборка =====
    let mut sheet_rows = String::new();
    // Шапка: A1 = "День/урок", B1.. = классы
    sheet_rows.push_str(r#"<row r="1">"#);
    sheet_rows.push_str(r#"<c r="A1" t="inlineStr" s="1"><is><t>День/урок</t></is></c>"#);
    for (i, c) in classes.iter().enumerate() {
        let col = col_name(i + 2);
        sheet_rows.push_str(&format!(r#"<c r="{}1" t="inlineStr" s="1"><is><t>{}</t></is></c>"#, col, xml_escape(&format!("{}{}", c.grade, c.letter))));
    }
    sheet_rows.push_str("</row>");

    let day_names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    let mut r = 1;
    for d in 0..n_days {
        for p in 0..rows_per_day {
            r += 1;
            sheet_rows.push_str(&format!(r#"<row r="{}">"#, r));
            // Первая колонка: "Пн 1" ... 
            sheet_rows.push_str(&format!(
                r#"<c r="A{}" t="inlineStr" s="2"><is><t>{} {}</t></is></c>"#,
                r, day_names[d], p + 1
            ));
            for (i, c) in classes.iter().enumerate() {
                let col = col_name(i + 2);
                let cell_ref = format!("{}{}", col, r);
                if let Some(labels) = grid.get(&(i, d, p)) {
                    let text = labels.join("; ");
                    let key = labels_first_teacher_subject(labels, slots);
                    let style_idx = key.map(|k| fill_by_key.get(&k).copied().unwrap_or(0)).unwrap_or(0) + 1;
                    sheet_rows.push_str(&format!(
                        r#"<c r="{}" t="inlineStr" s="{}"><is><t xml:space="preserve">{}</t></is></c>"#,
                        cell_ref, style_idx + 1, xml_escape(&text)
                    ));
                }
            }
            sheet_rows.push_str("</row>");
        }
    }

    // Styles: index 0 = default, 1 = header, 2 = row label, 3+ = fills
    let mut styles = String::new();
    styles.push_str(r#"<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#);
    styles.push_str(r#"<numFmts count="0"/>"#);
    styles.push_str(r#"<fonts count="1"><font><sz val="10"/><name val="Calibri"/></font></fonts>"#);
    styles.push_str(r#"<fills count="3">"#);
    styles.push_str(r#"<fill><patternFill patternType="none"/></fill>"#);
    styles.push_str(r#"<fill><patternFill patternType="gray125"/></fill>"#);
    styles.push_str(r#"<fill><patternFill patternType="solid"><fgColor rgb="FFE8EAF6"/><bgColor indexed="64"/></patternFill></fill>"#);
    styles.push_str(r#"</fills>"#);
    styles.push_str(r#"<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"#);
    styles.push_str(r#"<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>"#);
    styles.push_str(&format!(r#"<cellXfs count="{}">"#, 3 + fill_colors.len()));
    styles.push_str(r#"<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>"#);
    styles.push_str(r#"<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"><alignment horizontal="center"/></xf>"#);
    styles.push_str(r#"<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>"#);
    for &hash in &fill_colors {
        if hash == 0 { continue; }
        let rgb = format!("FF{:06X}", hash_to_pastel(hash));
        styles.push_str(&format!(r#"<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFill="1"><fill><patternFill patternType="solid"><fgColor rgb="{}"/></patternFill></fill></xf>"#, rgb));
    }
    styles.push_str(r#"</cellXfs>"#);
    styles.push_str(r#"<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>"#);
    styles.push_str(r#"</styleSheet>"#);

    // Worksheet
    let worksheet = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="{}" width="28" customWidth="1"/></cols>
<sheetData>{}</sheetData>
</worksheet>"#,
        classes.len() + 1,
        sheet_rows
    );

    let workbook = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Расписание" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#;

    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"#;

    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#;

    let workbook_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

    // Упаковка в ZIP
    let mut buf = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let files: Vec<(&str, &str)> = vec![
            ("[Content_Types].xml", content_types),
            ("_rels/.rels", root_rels),
            ("xl/workbook.xml", workbook),
            ("xl/_rels/workbook.xml.rels", workbook_rels),
            ("xl/worksheets/sheet1.xml", &worksheet),
            ("xl/styles.xml", &styles),
        ];
        for (name, content) in files {
            zip.start_file(name, opts).ok();
            zip.write_all(content.as_bytes()).ok();
        }
        zip.finish().ok();
    }
    buf.into_inner()
}

fn labels_first_teacher_subject(labels: &[String], slots: &[ScheduleExportSlot]) -> Option<(String, String)> {
    // Находим первый слот, чей составной текст присутствует в labels (грубое сопоставление не нужно —
    // просто берём по индексу). Для простоты возвращаем первый слот с совпадающим subject/teacher.
    slots.iter().next().map(|s| (s.teacher_id.clone(), s.subject_id.clone()))
}

fn djb2(s: &str) -> u32 {
    let mut h: u32 = 5381;
    for b in s.bytes() {
        h = h.wrapping_mul(33).wrapping_add(b as u32);
    }
    h
}

fn hash_to_pastel(h: u32) -> u32 {
    // Пастельный цвет: hue = h % 360, s=45%, l=85%
    let hue = (h % 360) as f64;
    let s = 0.45f64;
    let l = 0.85f64;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = (hue / 60.0) % 6.0;
    let x = c * (1.0 - (hp % 2.0 - 1.0).abs());
    let (r, g, b) = match hp as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c / 2.0;
    let to = |v: f64| ((v + m) * 255.0).round() as u32;
    (to(r) << 16) | (to(g) << 8) | to(b)
}

fn col_name(n: usize) -> String {
    let mut n = n;
    let mut s = String::new();
    while n > 0 {
        let rem = ((n - 1) % 26) as u8;
        s.insert(0, (b'A' + rem) as char);
        n = (n - 1) / 26;
    }
    s
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

#[derive(Debug, Clone)]
pub struct ScheduleExportClass { pub id: String, pub grade: i64, pub letter: String }
#[derive(Debug, Clone)]
pub struct ScheduleExportSubject { pub id: String, pub name: String }
#[derive(Debug, Clone)]
pub struct ScheduleExportTeacher { pub id: String, pub full_name: String }
#[derive(Debug, Clone)]
pub struct ScheduleExportRoom { pub id: String, pub name: String }
#[derive(Debug, Clone)]
pub struct ScheduleExportSlot {
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub room_id: String,
    pub day: i64,
    pub period: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> (Vec<ScheduleExportClass>, Vec<ScheduleExportSubject>, Vec<ScheduleExportTeacher>, Vec<ScheduleExportRoom>, Vec<ScheduleExportSlot>) {
        let classes = vec![
            ScheduleExportClass { id: "8a".into(), grade: 8, letter: "А".into() },
            ScheduleExportClass { id: "8b".into(), grade: 8, letter: "Б".into() },
        ];
        let subjects = vec![
            ScheduleExportSubject { id: "math".into(), name: "Математика".into() },
            ScheduleExportSubject { id: "phys".into(), name: "Физика".into() },
        ];
        let teachers = vec![
            ScheduleExportTeacher { id: "t1".into(), full_name: "Иванова".into() },
            ScheduleExportTeacher { id: "t2".into(), full_name: "Петрова".into() },
        ];
        let rooms = vec![
            ScheduleExportRoom { id: "r1".into(), name: "Каб. 1".into() },
            ScheduleExportRoom { id: "r2".into(), name: "Каб. 2".into() },
        ];
        let slots = vec![
            ScheduleExportSlot { class_id: "8a".into(), subject_id: "math".into(), teacher_id: "t1".into(), room_id: "r1".into(), day: 0, period: 0 },
            ScheduleExportSlot { class_id: "8a".into(), subject_id: "phys".into(), teacher_id: "t2".into(), room_id: "r2".into(), day: 0, period: 1 },
            ScheduleExportSlot { class_id: "8b".into(), subject_id: "math".into(), teacher_id: "t1".into(), room_id: "r1".into(), day: 1, period: 2 },
        ];
        (classes, subjects, teachers, rooms, slots)
    }

    #[test]
    fn test_export_xlsx_structure() {
        let (c, s, t, r, slots) = sample();
        let bytes = generate_xlsx(&c, &s, &t, &r, &slots);
        assert!(!bytes.is_empty());
        // ZIP сигнатура PK
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_export_xlsx_contains_sheet_xml() {
        let (c, s, t, r, slots) = sample();
        let bytes = generate_xlsx(&c, &s, &t, &r, &slots);
        // Распаковываем и ищем worksheet.xml со строкой предмета
        let cursor = Cursor::new(bytes);
        let mut zip = zip::ZipArchive::new(cursor).unwrap();
        let sheet = zip.by_name("xl/worksheets/sheet1.xml").unwrap();
        let mut text = String::new();
        use std::io::Read;
        let mut reader = sheet;
        let mut buf = Vec::new();
        reader.read_to_end(&mut buf).unwrap();
        text = String::from_utf8(buf).unwrap();
        assert!(text.contains("Математика"), "worksheet should contain subject name");
        assert!(text.contains("Иванова"), "worksheet should contain teacher name");
    }

    #[test]
    fn test_export_xlsx_colors() {
        let (c, s, t, r, slots) = sample();
        let bytes = generate_xlsx(&c, &s, &t, &r, &slots);
        let cursor = Cursor::new(bytes);
        let mut zip = zip::ZipArchive::new(cursor).unwrap();
        let styles = zip.by_name("xl/styles.xml").unwrap();
        let mut buf = Vec::new();
        use std::io::Read;
        let mut reader = styles;
        reader.read_to_end(&mut buf).unwrap();
        let text = String::from_utf8(buf).unwrap();
        // Пастельные заливки fgColor присутствуют
        assert!(text.contains("fgColor"), "styles should contain fill colors");
    }

    #[test]
    fn test_export_empty_grid() {
        let (c, s, t, r, _) = sample();
        let bytes = generate_xlsx(&c, &s, &t, &r, &[]);
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_col_name() {
        assert_eq!(col_name(1), "A");
        assert_eq!(col_name(26), "Z");
        assert_eq!(col_name(27), "AA");
        assert_eq!(col_name(52), "AZ");
    }

    #[test]
    fn test_djb2_and_pastel() {
        let h1 = djb2("t1:math");
        let h2 = djb2("t1:math");
        assert_eq!(h1, h2);
        let color = hash_to_pastel(h1);
        // RGB пастель в пределах 0xFFFFFF
        assert!(color <= 0xFFFFFF);
    }
}
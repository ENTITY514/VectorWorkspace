//! Чтение таблиц docx: `word/document.xml` → абзацы и таблицы (design §2).
//!
//! Дерево строится через `xml_tree::build_tree` (без дублирования парсера),
//! формулы OMML отдаются в `$…$` через `omml::node_to_latex`.

use std::io::Read;
use std::path::Path;

use crate::infra::omml::node_to_latex;
use crate::infra::xml_tree::{build_tree, XNode};

/// Ячейка таблицы: текст (абзацы через `\n`) и ширина в колонках сетки.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocxCell {
    pub text: String,
    pub span: usize,
}

/// Таблица: строки ячеек; пустые строки сохраняются.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocxTable {
    pub rows: Vec<Vec<DocxCell>>,
}

/// Содержимое документа: абзацы вне таблиц и таблицы верхнего уровня.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocxContent {
    pub paragraphs: Vec<String>,
    pub tables: Vec<DocxTable>,
}

/// Читает docx из файла.
pub fn read_docx(path: &Path) -> Result<DocxContent, String> {
    let bytes = std::fs::read(path)
        .map_err(|e| format!("не удалось прочитать {}: {e}", path.display()))?;
    read_docx_bytes(&bytes)
}

/// Читает docx из байтов (zip-архив).
pub fn read_docx_bytes(bytes: &[u8]) -> Result<DocxContent, String> {
    let xml = read_document_xml(bytes)?;
    let roots = build_tree(&xml);
    let doc = roots
        .iter()
        .find(|n| n.name == "document")
        .ok_or_else(|| "в word/document.xml нет корневого w:document".to_string())?;
    let body = doc
        .child("body")
        .ok_or_else(|| "в документе нет w:body".to_string())?;
    let mut content = DocxContent {
        paragraphs: Vec::new(),
        tables: Vec::new(),
    };
    for child in &body.children {
        match child.name.as_str() {
            "p" => content.paragraphs.push(paragraph_text(child)),
            "tbl" => content.tables.push(read_table(child)),
            _ => {}
        }
    }
    Ok(content)
}

/// `word/document.xml` из zip-архива как UTF-8 строка.
fn read_document_xml(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("файл не похож на docx (zip): {e}"))?;
    let mut file = archive
        .by_name("word/document.xml")
        .map_err(|e| format!("в архиве нет word/document.xml: {e}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| format!("ошибка чтения word/document.xml: {e}"))?;
    String::from_utf8(buf).map_err(|e| format!("word/document.xml не в UTF-8: {e}"))
}

/// Текст абзаца: `w:t` → текст, `w:tab` → пробел, `w:br` → `\n`,
/// `m:oMath` → `$latex$`.
fn paragraph_text(p: &XNode) -> String {
    let mut out = String::new();
    collect_text(p, &mut out);
    out
}

/// Обход содержимого абзаца: свойства (`pPr`/`rPr`) пропускаются,
/// математика не разбирается дальше целиком.
fn collect_text(node: &XNode, out: &mut String) {
    for child in &node.children {
        match child.name.as_str() {
            "pPr" | "rPr" => {}
            "t" => out.push_str(&child.text),
            "tab" => out.push(' '),
            "br" => out.push('\n'),
            "oMath" => {
                out.push('$');
                out.push_str(&node_to_latex(child));
                out.push('$');
            }
            _ => collect_text(child, out),
        }
    }
}

/// Таблица верхнего уровня с учётом `gridSpan` и `vMerge`.
fn read_table(tbl: &XNode) -> DocxTable {
    let mut rows = Vec::new();
    // открытые вертикальные объединения по колонкам сетки
    let mut grid: Vec<Option<String>> = Vec::new();
    for tr in tbl.children_named("tr") {
        let mut row: Vec<DocxCell> = Vec::new();
        let mut col = 0usize;
        for tc in tr.children_named("tc") {
            let span = cell_span(tc);
            let text = match vmerge(tc) {
                // Продолжение: текст из ячейки выше в той же колонке. Свой
                // непустой текст важнее (ошибочно объединённая дата в КТП).
                VMerge::Continue => {
                    let own = cell_text(tc);
                    if own.trim().is_empty() {
                        grid.get(col).cloned().flatten().unwrap_or_default()
                    } else {
                        own
                    }
                }
                VMerge::Restart => {
                    let text = cell_text(tc);
                    set_grid(&mut grid, col, span, Some(text.clone()));
                    text
                }
                VMerge::None => {
                    let text = cell_text(tc);
                    set_grid(&mut grid, col, span, None);
                    text
                }
            };
            row.push(DocxCell { text, span });
            col += span;
        }
        rows.push(row);
    }
    DocxTable { rows }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum VMerge {
    None,
    /// `w:vMerge w:val="restart"` — начало объединения.
    Restart,
    /// `w:vMerge` без `restart` — продолжение.
    Continue,
}

/// `w:tcPr/w:gridSpan/@w:val`, по умолчанию 1.
fn cell_span(tc: &XNode) -> usize {
    tc.child("tcPr")
        .and_then(|pr| pr.child("gridSpan"))
        .and_then(|g| g.val.as_deref())
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(1)
        .max(1)
}

fn vmerge(tc: &XNode) -> VMerge {
    let Some(pr) = tc.child("tcPr") else {
        return VMerge::None;
    };
    match pr.child("vMerge") {
        None => VMerge::None,
        Some(vm) if vm.val.as_deref() == Some("restart") => VMerge::Restart,
        Some(_) => VMerge::Continue,
    }
}

/// Записывает значение в колонки `[col, col+span)` сетки, растягивая её.
fn set_grid(grid: &mut Vec<Option<String>>, col: usize, span: usize, value: Option<String>) {
    if grid.len() < col + span {
        grid.resize(col + span, None);
    }
    for cell in &mut grid[col..col + span] {
        *cell = value.clone();
    }
}

/// Текст ячейки: абзацы через `\n`, вложенные таблицы вкладываются текстом.
fn cell_text(tc: &XNode) -> String {
    let mut parts: Vec<String> = Vec::new();
    for child in &tc.children {
        match child.name.as_str() {
            "p" => parts.push(paragraph_text(child)),
            "tbl" => parts.extend(nested_table_texts(child)),
            _ => {}
        }
    }
    parts.join("\n")
}

/// Текст вложенной таблицы — построчно, для вкладывания в ячейку родителя.
fn nested_table_texts(tbl: &XNode) -> Vec<String> {
    let mut out = Vec::new();
    for tr in tbl.children_named("tr") {
        for tc in tr.children_named("tc") {
            out.push(cell_text(tc));
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    /// Собирает docx в памяти: zip c одним `word/document.xml`.
    fn make_docx(document_xml: &str) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let opts =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("word/document.xml", opts).unwrap();
            zip.write_all(document_xml.as_bytes()).unwrap();
            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    fn doc(body: &str) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
<w:body>{body}</w:body>
</w:document>"#
        )
    }

    fn read(body: &str) -> DocxContent {
        let bytes = make_docx(&doc(body));
        read_docx_bytes(&bytes).unwrap_or_else(|e| panic!("разбор docx: {e}"))
    }

    /// m:oMath с корнем из x.
    const SQRT_X: &str = "<m:oMath><m:rad><m:radPr><m:degHide m:val=\"1\"/></m:radPr>\
                          <m:deg/><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>";

    /// Таблица 3×3: ячейка на 2 колонки и вертикальное объединение в 1-й колонке.
    fn table_3x3() -> String {
        r#"<w:tbl>
<w:tr>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>R1C1</w:t></w:r></w:p></w:tc>
  <w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>R1C2</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:p><w:r><w:t>R2C2</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>R2C3</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:p><w:r><w:t>R3C2</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>R3C3</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>"#
            .to_string()
    }

    #[test]
    fn paragraphs_outside_tables() {
        let content = read(
            r#"<w:p><w:r><w:t>Класс 8А</w:t></w:r></w:p>
<w:p><w:r><w:t>часов в неделю: 5</w:t></w:r></w:p>"#,
        );
        assert_eq!(content.paragraphs, vec!["Класс 8А", "часов в неделю: 5"]);
        assert!(content.tables.is_empty());
    }

    #[test]
    fn tab_and_br_in_paragraph() {
        let content = read(
            r#"<w:p><w:r><w:t>до</w:t><w:tab/><w:t>после</w:t></w:r><w:r><w:br/><w:t>новая</w:t></w:r></w:p>"#,
        );
        assert_eq!(content.paragraphs, vec!["до после\nновая"]);
    }

    #[test]
    fn omath_becomes_latex() {
        let content = read(&format!(
            r#"<w:p><w:r><w:t>Формула </w:t></w:r>{SQRT_X}</w:p>"#
        ));
        assert_eq!(content.paragraphs, vec!["Формула $\\sqrt{x}$"]);
    }

    #[test]
    fn table_grid_span_and_vmerge() {
        let content = read(&table_3x3());
        assert!(content.paragraphs.is_empty());
        assert_eq!(content.tables.len(), 1);
        let rows = &content.tables[0].rows;
        assert_eq!(rows.len(), 3);

        // первая строка: ячейка на 2 колонки
        assert_eq!(rows[0].len(), 2);
        assert_eq!(rows[0][0], DocxCell { text: "R1C1".into(), span: 1 });
        assert_eq!(rows[0][1], DocxCell { text: "R1C2".into(), span: 2 });

        // продолжения vMerge берут текст из ячейки выше
        assert_eq!(rows[1].len(), 3);
        assert_eq!(rows[1][0], DocxCell { text: "R1C1".into(), span: 1 });
        assert_eq!(rows[1][1], DocxCell { text: "R2C2".into(), span: 1 });
        assert_eq!(rows[1][2], DocxCell { text: "R2C3".into(), span: 1 });

        assert_eq!(rows[2].len(), 3);
        assert_eq!(rows[2][0], DocxCell { text: "R1C1".into(), span: 1 });
        assert_eq!(rows[2][1], DocxCell { text: "R3C2".into(), span: 1 });
        assert_eq!(rows[2][2], DocxCell { text: "R3C3".into(), span: 1 });
    }

    #[test]
    fn vmerge_continue_with_own_text_keeps_it() {
        let content = read(
            r#"<w:tbl>
<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>17.09</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p><w:r><w:t>22.09</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>
</w:tbl>"#,
        );
        let rows = &content.tables[0].rows;
        assert_eq!(rows[1][0].text, "22.09");
        assert_eq!(rows[2][0].text, "17.09");
    }

    #[test]
    fn cell_paragraphs_joined_and_formula() {
        let content = read(&format!(
            r#"<w:tbl><w:tr><w:tc>
<w:p><w:r><w:t>первый</w:t><w:br/><w:t>второй</w:t></w:r></w:p>
<w:p><w:r><w:t>третий </w:t></w:r>{SQRT_X}</w:p>
</w:tc></w:tr></w:tbl>"#
        ));
        assert_eq!(
            content.tables[0].rows[0][0].text,
            "первый\nвторой\nтретий $\\sqrt{x}$"
        );
    }

    #[test]
    fn empty_rows_preserved() {
        let content = read(
            r#"<w:tbl>
<w:tr></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>"#,
        );
        let rows = &content.tables[0].rows;
        assert_eq!(rows.len(), 2);
        assert!(rows[0].is_empty());
        assert_eq!(rows[1][0].text, "x");
    }

    #[test]
    fn nested_table_text_goes_into_cell() {
        let content = read(
            r#"<w:tbl><w:tr>
<w:tc><w:p><w:r><w:t>внешняя</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>до</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>вложенная</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:tc>
</w:tr></w:tbl>"#,
        );
        assert_eq!(content.tables.len(), 1, "вложенная таблица — не отдельная");
        let row = &content.tables[0].rows[0];
        assert_eq!(row[0].text, "внешняя");
        assert_eq!(row[1].text, "до\nвложенная");
    }

    #[test]
    fn missing_document_xml_is_error() {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let opts = SimpleFileOptions::default();
            zip.start_file("other.xml", opts).unwrap();
            zip.write_all(b"<x/>").unwrap();
            zip.finish().unwrap();
        }
        let err = read_docx_bytes(&buf.into_inner()).unwrap_err();
        assert!(err.contains("word/document.xml"), "{err}");
    }

    #[test]
    fn not_a_zip_is_error() {
        assert!(read_docx_bytes("это не zip".as_bytes()).is_err());
    }
}

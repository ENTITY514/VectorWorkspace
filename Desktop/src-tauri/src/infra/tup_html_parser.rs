//! HTML-парсер ТУП из формата ИПС «Әділет» (приказ № 399).
//! 
//! Нарезка на 129 документов по заголовку `<h3>` и ячейкам `<td>Приложение...</td>`.
//! Извлечение метаданных (предмет, классы, направление, язык, реквизиты приказа)
//! и сбор целей обучения из ячеек `<td>` Зоны 2 (Параграф 2. Система целей обучения).
//! 
//! Многостадийный конечный автомат:
//!   Стадия 1 — Глава 1 «Общие положения»: правовая основа, цель, задачи предмета.
//!   Стадия 2 — Параграф 1 «Содержание предмета»: учебная нагрузка по классам.
//!   Стадия 3 — Параграф 2 «Система целей обучения»: матрица целей.
//!   Стадия 4 — Параграф 3 «Долгосрочный план»: четверти -> разделы -> темы -> коды.

use crate::domain::tup::TupDirection;
use crate::infra::tup_parser::{
    find_objective_codes_html, grades_from_target, language_for_subject, normalize,
    subject_slug, ParsedObjective, ParsedTupDocument,
};
use scraper::{Html, Selector};
use std::ops::RangeInclusive;

#[derive(Debug, thiserror::Error)]
pub enum TupHtmlParseError {
    #[error("ошибка ввода-вывода: {0}")]
    Io(#[from] std::io::Error),
    #[error("документ не содержит распознанных целей: {0}")]
    EmptyDocument(String),
}

/// Распознанный документ из HTML с метаданными разбора.
#[derive(Debug, Clone)]
pub struct HtmlDocumentParseResult {
    pub document: ParsedTupDocument,
    pub raw_title: String,
    pub skipped_reason: Option<String>,
}

/// Глава 1 «Общие положения»: правовая основа, цель и задачи предмета.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedProvisions {
    pub legal_basis: String,
    pub goal_text: String,
    pub tasks: Vec<String>,
}

/// Параграф 1 «Содержание»: учебная нагрузка по классам.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ParsedHours {
    pub grade: i64,
    pub hours_per_week: f64,
    pub hours_per_year: i64,
}

/// Тема Долгосрочного плана (Параграф 3).
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedTopic {
    pub name: String,
    pub objective_codes: Vec<String>,
}

/// Раздел Долгосрочного плана (Параграф 3).
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedSection {
    pub name: String,
    pub topics: Vec<ParsedTopic>,
}

/// Четверть Долгосрочного плана (Параграф 3).
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedQuarter {
    pub grade: i64,
    pub quarter_number: i64,
    pub sections: Vec<ParsedSection>,
}

/// Полный распознанный документ: метаданные + цель/задачи + нагрузка + цели + ДСП.
#[derive(Debug, Clone)]
pub struct ParsedFullDocument {
    pub document: ParsedTupDocument,
    pub provisions: ParsedProvisions,
    pub hours: Vec<ParsedHours>,
    pub quarters: Vec<ParsedQuarter>,
}

/// Выполняет полный разбор HTML-файла ТУП.
pub fn parse_html_full(html_text: &str) -> (Vec<ParsedTupDocument>, Vec<(usize, String)>) {
    let doc_blocks = split_html_documents(html_text);
    let mut docs = Vec::new();
    let mut errors = Vec::new();

    for (index, block) in doc_blocks.into_iter().enumerate() {
        match parse_html_document(&block) {
            Ok(doc) => {
                docs.push(doc);
            }
            Err(err) => {
                errors.push((index + 1, err.to_string()));
            }
        }
    }

    (docs, errors)
}

/// Полный разбор HTML-файла ТУП со всеми стадиями (Глава 1, Параграфы 1-3).
pub fn parse_html_full_extended(
    html_text: &str,
) -> (Vec<ParsedFullDocument>, Vec<(usize, String)>) {
    let doc_blocks = split_html_documents(html_text);
    let mut docs = Vec::new();
    let mut errors = Vec::new();

    for (index, block) in doc_blocks.into_iter().enumerate() {
        match parse_full_document(&block) {
            Ok(doc) => {
                docs.push(doc);
            }
            Err(err) => {
                errors.push((index + 1, err.to_string()));
            }
        }
    }

    (docs, errors)
}

/// Разбирает один документ HTML целиком: метаданные, цель/задачи (Глава 1),
/// нагрузку (Параграф 1), цели (Параграф 2) и Долгосрочный план (Параграф 3).
fn parse_full_document(block: &HtmlDocBlock) -> Result<ParsedFullDocument, TupHtmlParseError> {
    // Базовый разбор: метаданные + цели из Параграфа 2.
    let document = parse_html_document(block)?;

    // Стадия 1: Глава 1 «Общие положения» — правовая основа, цель, задачи.
    let provisions = extract_provisions(&block.content_html);

    // Стадия 2: Параграф 1 — учебная нагрузка по классам.
    let hours = extract_hours(&block.content_html);

    // Стадия 4: Параграф 3 — Долгосрочный план (четверти -> разделы -> темы).
    let quarters = extract_long_term_plan(&block.content_html);

    Ok(ParsedFullDocument {
        document,
        provisions,
        hours,
        quarters,
    })
}

/// Структура одного блока документа в HTML.
struct HtmlDocBlock {
    header_title: String,
    appendix_text: String,
    content_html: String,
}

/// Разбивает весь HTML-документ на отдельные блоки документов по заголовкам `<h3>`.
fn split_html_documents(html_text: &str) -> Vec<HtmlDocBlock> {
    let mut blocks = Vec::new();
    let mut h3_positions = Vec::new();

    // Находим все <h3> заголовки документа ("Типовая учебная программа...")
    let mut search_pos = 0;
    while let Some(start) = html_text[search_pos..].find("<h3") {
        let abs_start = search_pos + start;
        if let Some(end) = html_text[abs_start..].find("</h3>") {
            let abs_end = abs_start + end + 5;
            let h3_inner = &html_text[abs_start..abs_end];
            let clean_h3 = clean_html_tags(h3_inner);
            if clean_h3.contains("Типовая учебная программа") {
                h3_positions.push((abs_start, abs_end, clean_h3));
            }
            search_pos = abs_end;
        } else {
            break;
        }
    }

    for (i, (start_h3, end_h3, title)) in h3_positions.iter().enumerate() {
        // Конец текущего документа — начало следующего `<h3>` главного документа или конец HTML
        let end_doc = if i + 1 < h3_positions.len() {
            h3_positions[i + 1].0
        } else {
            html_text.len()
        };

        // Ищем ячейку `<td>Приложение...</td>` перед текущим <h3>
        let search_back_start = if i == 0 { 0 } else { h3_positions[i - 1].1 };
        let preceding_slice = &html_text[search_back_start..*start_h3];
        let appendix_text = extract_preceding_appendix(preceding_slice);

        let content_html = html_text[*end_h3..end_doc].to_string();

        blocks.push(HtmlDocBlock {
            header_title: title.clone(),
            appendix_text,
            content_html,
        });
    }

    blocks
}

/// Извлечение текста ячейки `Приложение N...` перед заголовком документа.
fn extract_preceding_appendix(slice: &str) -> String {
    if let Some(last_td_pos) = slice.rfind("<td") {
        let td_slice = &slice[last_td_pos..];
        if let Some(end_td) = td_slice.find("</td>") {
            let inner = &td_slice[..end_td + 5];
            let clean = clean_html_tags(inner);
            if clean.contains("Приложение") {
                return clean;
            }
        }
    }
    String::new()
}

/// Очищает HTML теги и декодирует базовые сущности.
fn clean_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;

    for ch in html.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(ch);
        }
    }

    decode_html_entities(&result)
}

/// Декодирование HTML сущностей (&nbsp;, &quot;, &amp;, &lt;, &gt;).
fn decode_html_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
}

/// Разбирает один документ HTML (метаданные + цели).
fn parse_html_document(block: &HtmlDocBlock) -> Result<ParsedTupDocument, TupHtmlParseError> {
    // 1. Извлечение имени предмета из кавычек заголовка
    let name = extract_subject_name_from_title(&block.header_title)
        .ok_or_else(|| TupHtmlParseError::EmptyDocument(format!("Не удалось извлечь название предмета: {}", block.header_title)))?;

    let subject_id = subject_slug(&name)
        .ok_or_else(|| TupHtmlParseError::EmptyDocument(format!("Неизвестный предмет: '{name}'")))?
        .to_string();

    // 2. Извлечение целевых классов
    let target_grades = extract_target_grades(&block.header_title);
    let has_grade_12 = block.header_title.contains("(12)");
    let valid_grades = grades_from_target(&target_grades, has_grade_12);

    // 3. Направление (common / emn / ogn)
    let direction = if block.header_title.contains("естественно-математического") {
        TupDirection::Emn
    } else if block.header_title.contains("общественно-гуманитарного") {
        TupDirection::Ogn
    } else {
        TupDirection::Common
    };

    // 4. Язык
    let language = language_for_subject(&subject_id).to_string();

    // 5. Номер приложения и реквизиты приказа
    let app_num = parse_appendix_number(&block.appendix_text);
    let (order_num, order_date) = parse_order_meta(&block.appendix_text);

    // 6. Выделение Зоны 2 (Параграф 2. Система целей обучения)
    let zone_html = extract_zone_2_html(&block.content_html)
        .ok_or_else(|| TupHtmlParseError::EmptyDocument(format!("Зона целей обучения (Параграф 2) не найдена в документе '{name}'")))?;

    // 7. Извлечение целей обучения из ячеек <td> в Зоне 2
    let objectives = extract_objectives_from_html_zone(&zone_html, valid_grades);

    if objectives.is_empty() {
        return Err(TupHtmlParseError::EmptyDocument(format!(
            "Документ '{name}' ({target_grades} кл.) не содержит кодов целей в Зоне 2"
        )));
    }

    Ok(ParsedTupDocument {
        order_number: order_num,
        order_date,
        appendix_number: app_num,
        subject_id,
        language,
        target_grades,
        direction,
        objectives,
    })
}

/// Название предмета из кавычек заголовка.
fn extract_subject_name_from_title(title: &str) -> Option<String> {
    let open = title.find('"')?;
    let after = &title[open + 1..];
    let close = after.find('"')?;
    let raw_name = &after[..close];
    Some(normalize(raw_name))
}

/// Классы из строки заголовка ("для 7-9 классов", "для 10-11-классов", "для 1 класса").
fn extract_target_grades(title: &str) -> String {
    let grade_re = regex::Regex::new(r"для\s+(\d{1,2})\s*-\s*(\d{1,2})").unwrap();
    let single_re = regex::Regex::new(r"для\s+(\d{1,2})\s+класса").unwrap();
    if let Some(cap) = grade_re.captures(title) {
        return format!("{}-{}", &cap[1], &cap[2]);
    }
    if let Some(cap) = single_re.captures(title) {
        let g = &cap[1];
        return format!("{g}-{g}");
    }
    "1-12".to_string()
}

/// Извлечение номера приложения из строки `Приложение N`.
fn parse_appendix_number(text: &str) -> i64 {
    let token = "Приложение ";
    if let Some(pos) = text.find(token) {
        let after = &text[pos + token.len()..];
        let num_str: String = after
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '-')
            .collect();
        if let Some((first, _)) = num_str.split_once('-') {
            return first.parse().unwrap_or(1);
        }
        return num_str.parse().unwrap_or(1);
    }
    1
}

/// Извлечение номера приказа и даты из текста приложения.
fn parse_order_meta(text: &str) -> (String, String) {
    let num_token = "№ ";
    let order_num = if let Some(pos) = text.find(num_token) {
        let after = &text[pos + num_token.len()..];
        let num: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !num.is_empty() { num } else { "399".to_string() }
    } else {
        "399".to_string()
    };

    let date_token = "от ";
    let order_date = if let Some(pos) = text.find(date_token) {
        let after = &text[pos + date_token.len()..];
        if let Some(g) = after.find(" года") {
            let date_str = &after[..g];
            parse_russian_date(date_str).unwrap_or_else(|| "2022-09-16".to_string())
        } else {
            "2022-09-16".to_string()
        }
    } else {
        "2022-09-16".to_string()
    };

    (order_num, order_date)
}

/// Преобразование «16 сентября 2022» -> «2022-09-16».
fn parse_russian_date(date_str: &str) -> Option<String> {
    let clean = date_str.replace('"', "").replace('«', "").replace('»', "");
    let parts: Vec<&str> = clean.split_whitespace().collect();
    if parts.len() >= 3 {
        let day: u32 = parts[0].parse().ok()?;
        let month = crate::infra::tup_parser::month_number(parts[1])?;
        let year: u32 = parts[2].parse().ok()?;
        Some(format!("{year:04}-{month}-{day:02}"))
    } else {
        None
    }
}

/// Находит HTML-код Зоны 2 (Параграф 2. Система целей обучения) до Параграфа 3.
/// Вторая зона с сокращением нагрузки отбрасывается.
fn extract_zone_2_html(content_html: &str) -> Option<String> {
    // Находим первый заголовок Параграфа 2
    let p2_start = content_html.find("Параграф 2")?;
    
    // Начало зоны — после закрывающего </h3> первого Параграфа 2
    let after_p2 = &content_html[p2_start..];
    let h3_end_rel = after_p2.find("</h3>")?;
    let zone_start_abs = p2_start + h3_end_rel + 5;

    // Конец зоны — первый заголовок Параграфа 3 после начала Зоны 2
    let remaining = &content_html[zone_start_abs..];
    let zone_end_rel = remaining
        .find("Параграф 3")
        .or_else(|| remaining.find("Параграф 4"))
        .unwrap_or(remaining.len());

    let zone_html = &remaining[..zone_end_rel];
    Some(zone_html.to_string())
}

/// Извлекает список целей обучения из всех `<td>` ячеек Зоны 2 HTML.
fn extract_objectives_from_html_zone(
    zone_html: &str,
    valid_grades: RangeInclusive<i64>,
) -> Vec<ParsedObjective> {
    let fragment = Html::parse_fragment(zone_html);
    let td_selector = Selector::parse("td").expect("Валидный CSS селектор td");

    let mut objectives = Vec::new();

    for td in fragment.select(&td_selector) {
        // Подготавливаем текст ячейки: заменяем <br> и </p> на переносы строк
        let inner_html = td.html();
        let preprocessed = inner_html
            .replace("<br>", "\n")
            .replace("<br/>", "\n")
            .replace("<br />", "\n")
            .replace("</p>", "\n")
            .replace("</div>", "\n");

        let cell_text = clean_html_tags(&preprocessed);
        let normalized = normalize(&cell_text);

        if normalized.is_empty() {
            continue;
        }

        // Собираем строки ячейки, пропуская заголовки колонок.
        // Код и описание цели могут находиться на разных строках
        // (разделены <br>), поэтому склеиваем их в одну строку.
        let mut cell_lines: Vec<String> = Vec::new();
        for line in cell_text.lines() {
            let clean_line = normalize(line);
            if clean_line.is_empty() {
                continue;
            }

            // Пропускаем строки заголовков колонок
            if is_column_header(&clean_line) {
                continue;
            }

            cell_lines.push(clean_line);
        }
        let joined = cell_lines.join(" ");
        if joined.is_empty() {
            continue;
        }

        // Находим все вхождения кодов в ячейке
        let codes = find_objective_codes_html(&joined);
        if codes.is_empty() {
            continue;
        }

        for (i, (m, parts)) in codes.iter().enumerate() {
            // Проверяем соответствие класса диапазону документа
            if !valid_grades.contains(&parts.grade) {
                continue;
            }

            // Описание — текст между этим кодом и следующим (или концом ячейки).
            let code_match_str = m.as_str();
            let code_end_pos = m.end();
            let next_start = codes
                .get(i + 1)
                .map(|(nm, _)| nm.start())
                .unwrap_or(joined.len());
            let raw_desc = if code_end_pos < next_start {
                joined[code_end_pos..next_start].trim()
            } else {
                ""
            };

            let description = clean_objective_description(raw_desc);
            // Голый код без описания — это заголовок колонки матричной
            // таблицы («<td><p>8.1.3</p></td>»), а не цель обучения.
            if description.is_empty() {
                continue;
            }

            let code_str = if parts.subsection_number == 1 && code_match_str.matches('.').count() == 2 {
                format!("{}.{}.{}", parts.grade, parts.section_number, parts.objective_number)
            } else {
                format!(
                    "{}.{}.{}.{}",
                    parts.grade, parts.section_number, parts.subsection_number, parts.objective_number
                )
            };

            objectives.push(ParsedObjective {
                grade: parts.grade,
                section_number: parts.section_number,
                subsection_number: parts.subsection_number,
                objective_number: parts.objective_number,
                code: code_str,
                description,
            });
        }
    }

    objectives
}

/// Стадия 1: Глава 1 «Общие положения» — правовая основа (п.1), цель, задачи.
/// Маркеры «Цель/Цель обучения» и «Задачи:» нестабильны (номер пункта
/// меняется: п.2/п.3/п.4), поэтому сканируется текст всей Главы 1.
fn extract_provisions(content_html: &str) -> ParsedProvisions {
    let Some(ch1_start) = content_html.find("Глава 1") else {
        return ParsedProvisions::default();
    };
    let Some(ch2_start) = content_html[ch1_start..].find("Глава 2") else {
        return ParsedProvisions::default();
    };
    let chapter = &content_html[ch1_start..ch1_start + ch2_start];
    let text = clean_html_tags(chapter);
    let normalized = normalize(&text);

    // Правовая основа — абзац, начинающийся с «1. Учебная программа разработана…»
    let legal_basis = extract_legal_basis(&normalized);

    // Цель — текст после маркера «Цель/Цель обучения/Основная цель».
    let goal_text = extract_goal_text(&normalized);

    // Задачи — нумерованные пункты 1)…N) после «Задачи/Задачи обучения».
    let tasks = extract_tasks(&normalized);

    ParsedProvisions {
        legal_basis,
        goal_text,
        tasks,
    }
}

fn extract_legal_basis(text: &str) -> String {
    // Абзац «1. Учебная программа разработана в соответствии с…»
    for para in text.split("&nbsp;").flat_map(|s| s.split("  ")).collect::<Vec<_>>() {
        let t = para.trim();
        if t.starts_with("1. ") && t.contains("разработана") && t.contains("соответствии") {
            return t.to_string();
        }
        if t.starts_with("1.") && t.len() > 3 && t.contains("Учебная программа") {
            return t.to_string();
        }
    }
    // Запасной вариант: первый абзац, начинающийся с «1. »
    if let Some(idx) = text.find("1. Учебная программа") {
        let para = &text[idx..];
        let end = para
            .find("2.")
            .map(|e| idx + e)
            .unwrap_or(text.len());
        return text[idx..end].trim().to_string();
    }
    String::new()
}

fn extract_goal_text(text: &str) -> String {
    // Формат 1: «3. Цель: овладение…» (геометрия 10-11, алгебра 7-9).
    for marker in ["Цель обучения учебному предмету", "Цель обучения предмету", "Основная цель обучения", "Цель:"] {
        if let Some(idx) = text.find(marker) {
            let after = &text[idx + marker.len()..];
            let after = after.trim_start_matches([':', '–', '-', ' ']);
            // До конца предложения (точка + пробел + цифра следующего пункта).
            let end = find_paragraph_end(after);
            return after[..end].trim().to_string();
        }
    }
    String::new()
}

fn find_paragraph_end(s: &str) -> usize {
    // Конец абзаца — точка, за которой идёт пробел и цифра (следующий пункт),
    // или конец строки. В середине предложения встречаются точки-сокращения.
    let mut prev_digit = false;
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'.' && i + 1 < bytes.len() {
            let next = bytes[i + 1];
            if next == b' ' || next == b'\t' {
                // Проверяем, что после пробела идёт цифра (новый пункт «5. Задачи»).
                let rest = s[i + 2..].trim_start();
                if rest.starts_with(|c: char| c.is_ascii_digit()) && prev_digit {
                    return i + 1;
                }
            }
        }
        prev_digit = b.is_ascii_digit();
    }
    s.len()
}

fn extract_tasks(text: &str) -> Vec<String> {
    // Ищем маркер «Задачи:» или «Задачи обучения:» или «задач:»
    let marker_pos = ["Задачи обучения:", "Задачи:", "Задачи", "задач:"]
        .iter()
        .filter_map(|m| text.find(m))
        .min()
        .unwrap_or(text.len());
    if marker_pos == text.len() {
        return Vec::new();
    }

    // Собираем пункты вида «1) …» до конца списка (без look-ahead —
    // regex Rust не поддерживает; идём по позициям).
    let mut tasks = Vec::new();
    let after = &text[marker_pos..];
    let re = regex::Regex::new(r"(?m)(?:^|\s)(\d{1,2})\)\s+(.+)").unwrap();

    let mut ranges: Vec<(usize, usize, usize)> = Vec::new(); // (start, num_len, text_start)
    for cap in re.captures_iter(after) {
        let m = cap.get(0).unwrap();
        let num = cap[1].parse::<i64>().ok();
        if num.is_none() {
            continue;
        }
        ranges.push((m.start(), m.start() + cap[1].len() + 1, cap.get(2).unwrap().start()));
    }

    for (i, &(_start, _num_end, text_start)) in ranges.iter().enumerate() {
        let end = ranges
            .get(i + 1)
            .map(|&(next_start, _, _)| next_start)
            .unwrap_or(after.len());
        let task = normalize(&after[text_start..end]);
        if !task.is_empty() {
            tasks.push(task);
        }
        if tasks.len() >= 10 {
            break;
        }
    }
    tasks
}

/// Стадия 2: Параграф 1 — «Максимальный объем учебной нагрузки … составляет:».
/// Строки: «1) в 7 классе - 2 часа в неделю, 68 часов в учебном году;»
/// и «1) во 2 классе - 4 часа в неделю, 136 часов в учебном году».
fn extract_hours(content_html: &str) -> Vec<ParsedHours> {
    let Some(p1_start) = content_html.find("Параграф 1") else {
        return Vec::new();
    };
    let remaining = &content_html[p1_start..];
    let Some(p2_start) = remaining.find("Параграф 2") else {
        return Vec::new();
    };
    let para1 = &remaining[..p2_start];
    let text = clean_html_tags(para1);
    let normalized = normalize(&text);

    let re = regex::Regex::new(
        r"в(?:о)?\s+(\d{1,2})\s+классе\s*[-–—]?\s*(\d+(?:[.,]\d+)?)\s*час(?:а|ов|а\s)?\s*в\s+неделю[^,]*?,\s*(\d+)\s*час(?:а|ов|а\s)?\s*в\s+учебном\s+году",
    )
    .unwrap();

    let mut hours = Vec::new();
    for cap in re.captures_iter(&normalized) {
        let grade: i64 = cap[1].parse().unwrap_or(0);
        let week: f64 = cap[2].replace(',', ".").parse().unwrap_or(0.0);
        let year: i64 = cap[3].parse().unwrap_or(0);
        if grade >= 1 && grade <= 12 && week > 0.0 && year > 0 {
            hours.push(ParsedHours {
                grade,
                hours_per_week: week,
                hours_per_year: year,
            });
        }
    }
    hours
}

/// Стадия 4: Параграф 3 «Долгосрочный план» — конечный автомат по строкам таблицы.
/// Два формата таблиц:
///   3 колонки (основная школа): Раздел | Содержание раздела | Цели обучения
///   4 колонки (начальная школа): Сквозные темы | Раздел | Подразделы | Цели
/// Строки: маркер четверти (colspan, одна ячейка), раздел (rowspan), темы.
/// Класс определяется по преамбуле перед каждой таблицей («1) 7 класс:»).
fn extract_long_term_plan(content_html: &str) -> Vec<ParsedQuarter> {
    let Some(p3_start) = content_html.find("Параграф 3") else {
        return Vec::new();
    };
    let zone = &content_html[p3_start..];

    let table_start_re = regex::Regex::new(r"<table").unwrap();
    let table_end_re = regex::Regex::new(r"</table>").unwrap();
    let grade_re = regex::Regex::new(r"(\d{1,2})\s+класс[а-я]*:").unwrap();

    let tr_sel = Selector::parse("tr").expect("Валидный CSS селектор tr");
    let td_sel = Selector::parse("td").expect("Валидный CSS селектор td");

    let mut quarters: Vec<ParsedQuarter> = Vec::new();
    let mut current_grade: i64 = 0;
    let mut current_quarter: Option<usize> = None;
    let mut current_section: Option<String> = None;

    // Ищем таблицы по позициям; преамбула каждой таблицы — текст между
    // концом предыдущей `</table>` и началом текущей `<table`.
    let mut cursor = 0usize;
    while let Some(rel) = table_start_re.find(&zone[cursor..]) {
        let table_start = cursor + rel.start();
        // Преамбула: «1) 7 класс:» между предыдущей таблицей и текущей.
        let preamble = clean_html_tags(&zone[cursor..table_start]);
        if let Some(cap) = grade_re.captures(&preamble) {
            if let Ok(g) = cap[1].parse::<i64>() {
                if (1..=12).contains(&g) {
                    current_grade = g;
                }
            }
        }

        // Конец таблицы — следующее `</table>` после её начала.
        let Some(end_rel) = table_end_re.find(&zone[table_start..]) else {
            break;
        };
        let table_end = table_start + end_rel.start() + "</table>".len();
        let table_html = &zone[table_start..table_end];
        cursor = table_end;

        let fragment = Html::parse_fragment(table_html);
        let mut saw_header = false;
        let mut cols = 0usize;

        for tr in fragment.select(&tr_sel) {
            let cells: Vec<String> = tr
                .select(&td_sel)
                .map(|td| normalize(&clean_html_tags(&td.html())))
                .collect();
            if cells.is_empty() {
                continue;
            }

            // Первая строка — заголовок («Раздел долгосрочного плана | Содержание | Цели»).
            if !saw_header {
                saw_header = true;
                cols = cells.len();
                continue;
            }

            // Строка-маркер четверти: одна ячейка «N четверть».
            if cells.len() == 1 {
                if let Some(q) = parse_quarter_marker(&cells[0]) {
                    // Находим или создаём четверть (grade, q) в quarters.
                    let idx = match quarters
                        .iter()
                        .position(|qtr| qtr.grade == current_grade && qtr.quarter_number == q)
                    {
                        Some(i) => i,
                        None => {
                            quarters.push(ParsedQuarter {
                                grade: current_grade,
                                quarter_number: q,
                                sections: Vec::new(),
                            });
                            quarters.len() - 1
                        }
                    };
                    current_quarter = Some(idx);
                    current_section = None;
                }
                continue;
            }

            // Определяем колонки в зависимости от общего количества колонок и длины текущей строки.
            // При rowspan у ячейки Раздела в <tr> остаётся на 1 ячейку меньше (2 вместо 3, 3 вместо 4).
            let is_4col = cols >= 4;
            let (raw_section, topic_text, codes_text) = match (is_4col, cells.len()) {
                (false, 3) => (Some(cells[0].as_str()), cells[1].as_str(), cells[2].as_str()),
                (false, 2) => (None, cells[0].as_str(), cells[1].as_str()),
                (true, 4) => (Some(cells[1].as_str()), cells[2].as_str(), cells[3].as_str()),
                (true, 3) => (None, cells[1].as_str(), cells[2].as_str()),
                _ => {
                    if cells.len() >= 3 {
                        (Some(cells[0].as_str()), cells[cells.len() - 2].as_str(), cells[cells.len() - 1].as_str())
                    } else if cells.len() == 2 {
                        (None, cells[0].as_str(), cells[1].as_str())
                    } else {
                        continue;
                    }
                }
            };

            let clean_sec = raw_section.unwrap_or_default().trim();
            let has_section = !clean_sec.is_empty()
                && clean_sec != "Раздел"
                && !clean_sec.contains("долгосрочного плана");

            let section_name = if has_section {
                current_section = Some(clean_sec.to_string());
                clean_sec.to_string()
            } else {
                match &current_section {
                    Some(s) => s.clone(),
                    None => continue,
                }
            };

            let Some(q_idx) = current_quarter else {
                continue;
            };

            let topic_name = topic_text.trim().to_string();
            if topic_name.is_empty() || topic_name == "Содержание раздела долгосрочного плана" {
                continue;
            }

            let codes: Vec<String> = find_objective_codes_html(codes_text)
                .into_iter()
                .map(|(_, p)| {
                    if p.subsection_number == 1 && codes_text.matches('.').count() == 2 {
                        format!("{}.{}.{}", p.grade, p.section_number, p.objective_number)
                    } else {
                        format!(
                            "{}.{}.{}.{}",
                            p.grade, p.section_number, p.subsection_number, p.objective_number
                        )
                    }
                })
                .collect();


            let q = &mut quarters[q_idx];

            // Находим раздел в текущей четверти (по имени) или создаём.
            let pos = q.sections.iter().position(|s| s.name == section_name);
            let pos = match pos {
                Some(p) => p,
                None => {
                    q.sections.push(ParsedSection {
                        name: section_name.clone(),
                        topics: Vec::new(),
                    });
                    q.sections.len() - 1
                }
            };
            let section = &mut q.sections[pos];

            section.topics.push(ParsedTopic {
                name: topic_name,
                objective_codes: codes,
            });
        }
    }

    quarters
}

/// «N четверть» -> Some(N), иначе None.
fn parse_quarter_marker(cell: &str) -> Option<i64> {
    let t = cell.trim().to_lowercase();
    if !t.contains("четверть") {
        return None;
    }
    let digits: String = t.chars().take_while(|c| c.is_ascii_digit()).collect();
    let n: i64 = digits.parse().unwrap_or(0);
    if (1..=4).contains(&n) {
        Some(n)
    } else {
        None
    }
}

/// Признак строки-заголовка таблицы (например, "Раздел", "Подраздел", "5 класс", "Обучающиеся должны").
fn is_column_header(line: &str) -> bool {
    let t = line.trim();
    if t.starts_with("Подраздел") || t.starts_with("Раздел") || t.starts_with("Обучающиеся должны") {
        return true;
    }
    // "5 класс", "10 класс"
    if t.ends_with("класс") || t.ends_with("классы") {
        let first_word = t.split_whitespace().next().unwrap_or("");
        if first_word.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    false
}

/// Очистка текста описания цели от лишних знаков препинания на концах.
fn clean_objective_description(desc: &str) -> String {
    let mut clean = desc.trim();
    // Удаляем ведущие двоеточия, дефисы или точки, если они слиплись с кодом
    clean = clean.trim_start_matches(|c: char| c == ':' || c == '-' || c == '.' || c.is_whitespace());
    clean.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_splits_html_documents() {
        let html = r#"
            <table><tr><td>Приложение 1 к приказу № 399 от 16 сентября 2022 года</td></tr></table>
            <h3>Типовая учебная программа по учебному предмету "Алгебра" для 7-9 классов</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table><tr><td>7.1.1.1 записывать числа в стандартном виде</td></tr></table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty(), "Ошибки: {:?}", errors);
        assert_eq!(docs.len(), 1);

        let doc = &docs[0];
        assert_eq!(doc.subject_id, "algebra");
        assert_eq!(doc.target_grades, "7-9");
        assert_eq!(doc.objectives.len(), 1);
        assert_eq!(doc.objectives[0].code, "7.1.1.1");
        assert_eq!(doc.objectives[0].description, "записывать числа в стандартном виде");
    }

    #[test]
    fn test_ignores_second_reduced_zone() {
        let html = r#"
            <td>Приложение 5 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "Казахский язык" для 5-9 классов</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table><tr><td>5.1.1.1 понимание речи</td></tr></table>
            <h3>Параграф 3. Долгосрочный план</h3>
            <h3>Глава 3. (с сокращением учебной нагрузкой)</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table><tr><td>5.1.1.1 понимание речи (сокращ)</td></tr></table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty());
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].objectives.len(), 1);
        assert_eq!(docs[0].objectives[0].description, "понимание речи");
    }

    #[test]
    fn test_matrix_10_11_without_glued_codes() {
        let html = r#"
            <td>Приложение 12 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "Геометрия" для 10-11 классов естественно-математического направления</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table>
                <tr>
                    <td>10.1.1 знать аксиомы стереометрии</td>
                    <td>11.1.1 знать понятие вектора в пространстве</td>
                </tr>
            </table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty());
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].objectives.len(), 2);
        assert_eq!(docs[0].objectives[0].code, "10.1.1");
        assert_eq!(docs[0].objectives[1].code, "11.1.1");
    }

    #[test]
    fn test_zero_width_space_and_glued_code() {
        let html = r#"
            <td>Приложение 20 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "Химия" для 7-9 классов</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table><tr><td>​7.1.4.1​знать состав воздуха</td></tr></table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty());
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].objectives[0].code, "7.1.4.1");
        assert_eq!(docs[0].objectives[0].description, "знать состав воздуха");
    }

    #[test]
    fn test_grade_range_10_11_hyphenated_classes() {
        let html = r#"
            <td>Приложение 21 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "География" для 10-11-классов естественно-математического направления</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table>
                <tr>
                    <td>1.3.2.4 - разрабатывать решения по повышению качества окружающей среды</td>
                    <td>11.3.2.5 - предлагать проекты по улучшению состояния окружающей среды</td>
                </tr>
            </table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty());
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].target_grades, "10-11");
        // Код 1.3.2.4 (класс 1) — артефакт источника, вне диапазона 10-11 — отброшен.
        assert_eq!(docs[0].objectives.len(), 1);
        assert_eq!(docs[0].objectives[0].code, "11.3.2.5");
    }

    #[test]
    fn test_code_with_trailing_dot_and_multiple_codes_in_cell() {
        let html = r#"
            <td>Приложение 22 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "Трудовое обучение" для 1-4 классов</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table><tr><td>4.2.2.4. декорировать творческую работу нетрадиционными материалами; 4.2.2.5 создавать современную продукцию</td></tr></table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty());
        assert_eq!(docs.len(), 1);
        let objectives = &docs[0].objectives;
        assert_eq!(objectives.len(), 2);
        assert_eq!(objectives[0].code, "4.2.2.4");
        assert_eq!(
            objectives[0].description,
            "декорировать творческую работу нетрадиционными материалами;"
        );
        assert_eq!(objectives[1].code, "4.2.2.5");
        assert_eq!(objectives[1].description, "создавать современную продукцию");
    }

    #[test]
    fn test_code_and_description_split_by_br() {
        let html = r#"
            <td>Приложение 23 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "Русский язык" для 5-9 классов</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table>
                <tr>
                    <td><p id="z1">5.1.4.1<br>прогнозировать содержание по отрывкам текста</p></td>
                </tr>
                <tr>
                    <td><p id="z2">7.4.3.1<br><a name="a1"></a>использовать правильно глагол и его формы;<br><a name="a2"></a>7.4.3.2<br>соблюдать нормы глагольного управления</p></td>
                </tr>
            </table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty(), "Ошибки: {:?}", errors);
        assert_eq!(docs.len(), 1);
        let objectives = &docs[0].objectives;
        assert_eq!(objectives.len(), 3);
        assert_eq!(objectives[0].code, "5.1.4.1");
        assert_eq!(objectives[0].description, "прогнозировать содержание по отрывкам текста");
        assert_eq!(objectives[1].code, "7.4.3.1");
        assert_eq!(objectives[1].description, "использовать правильно глагол и его формы;");
        assert_eq!(objectives[2].code, "7.4.3.2");
        assert_eq!(objectives[2].description, "соблюдать нормы глагольного управления");
    }

    #[test]
    fn test_skips_column_header_cells() {
        let html = r#"
            <td>Приложение 24 к приказу № 399</td>
            <h3>Типовая учебная программа по учебному предмету "Геометрия" для 7-9 классов</h3>
            <h3>Параграф 2. Система целей обучения</h3>
            <table>
                <tr>
                    <td><p>3. Метрические соотношения</p></td>
                    <td><p>7.1.3.</p></td>
                    <td><p>8.1.3</p></td>
                    <td><p>9.1.3.</p></td>
                </tr>
                <tr>
                    <td><p>7.1.3.1 знать и применять неравенство треугольника</p></td>
                    <td><p>8.1.3.1 знать и применять свойства медиан</p></td>
                </tr>
            </table>
            <h3>Параграф 3. Долгосрочный план</h3>
        "#;

        let (docs, errors) = parse_html_full(html);
        assert!(errors.is_empty(), "Ошибки: {:?}", errors);
        assert_eq!(docs.len(), 1);
        let objectives = &docs[0].objectives;
        assert_eq!(objectives.len(), 2);
        assert_eq!(objectives[0].code, "7.1.3.1");
        assert_eq!(objectives[1].code, "8.1.3.1");
        assert!(objectives.iter().all(|o| !o.description.is_empty()));
    }
}

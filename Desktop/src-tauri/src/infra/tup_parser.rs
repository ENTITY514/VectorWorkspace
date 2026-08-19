//! Парсер ТУП из извлечённого текстового слоя PDF (Приказ № 399 от 16.09.2022).
//!
//! Вход — полный текст документа (UTF-8). Выход — структурированные документы
//! с целями обучения. Парсер — «абсолютный фильтр» (ADR 7.1): он сам находит
//! маркеры дисциплин, направлений и зон целей, извлекая только реальные коды.
//!
//! Известные артефакты исходного текста:
//! - `Ұ` (U+04B0) вместо `ё`;
//! - zero-width space (U+200B) внутри кодов информатики;
//! - маркеры страниц `===== PAGE N =====`;
//! - заголовки колонок таблицы (`Подраздел 7 класс 8 класс 9 класс`);
//! - заголовки подразделов, приклеенные к коду (`Решение текстовых задач7.4.2.1`).

use crate::domain::tup::{TupDirection, TupDocument};

/// Ошибка парсинга: документ не распознан или структура нарушена.
#[derive(Debug, thiserror::Error)]
pub enum TupParseError {
    #[error("предмет не распознан в заголовке: {0}")]
    UnknownSubject(String),
    #[error("диапазон классов не найден в заголовке: {0}")]
    MissingGrades(String),
    #[error("в документе не найдена зона «Система целей обучения»")]
    MissingObjectivesZone,
    #[error("в документе не найдена зона целей обучения (якорь таблицы)")]
    MissingObjectivesAnchor,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// Сырая цель обучения до присвоения идентификатора.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedObjective {
    pub grade: i64,
    pub section_number: i64,
    pub subsection_number: i64,
    pub objective_number: i64,
    /// Точный код из ТУП: `8.4.2.1` (4 части) или `10.1.1` (3 части, геометрия 10-11).
    pub code: String,
    pub description: String,
}

/// Распознанный документ ТУП (метаданные + цели).
#[derive(Debug, Clone)]
pub struct ParsedTupDocument {
    pub order_number: String,
    pub order_date: String,
    pub appendix_number: i64,
    pub subject_id: String,
    pub language: String,
    pub target_grades: String,
    pub direction: TupDirection,
    pub objectives: Vec<ParsedObjective>,
}

/// Карта названий предметов на стабильные slug-идентификаторы.
/// Названия — в кавычках заголовка (нормализованные: ё/пробелы).
pub(crate) fn subject_slug(title: &str) -> Option<&'static str> {
    match title.trim() {
        // Начальная школа (1-4).
        "Әліппе" => Some("alphabet"),
        "Букварь" => Some("bukvar"),
        "Обучение грамоте" => Some("gramota"),
        "Елипбә" => Some("elipbe"),
        "Алифбе" => Some("alifbe"),
        "Алифбо" => Some("alifbo"),
        "Ана тілі" => Some("ana_tili"),
        "Математика" => Some("mathematics"),
        "Цифровая грамотность" => Some("digital_literacy"),
        "Цифрлық сауаттылық" => Some("digital_literacy"),
        "Естествознание" => Some("natural_science"),
        "Жаратылыстану" => Some("natural_science"),
        "Познание мира" => Some("world_knowledge"),
        "Дүниетану" => Some("world_knowledge"),
        "Изобразительное искусство" => Some("visual_art"),
        "Бейнелеу өнері" => Some("visual_art"),
        "Трудовое обучение" => Some("labor_training"),
        "Еңбекке баулу" => Some("labor_training"),
        "Художественный труд" => Some("art_work"),
        "Көркем еңбек" => Some("art_work"),
        "Музыка" => Some("music"),
        "Физическая культура" => Some("physical_education"),
        "Дене шынықтыру" => Some("physical_education"),
        "Литературное чтение" => Some("literary_reading"),
        "Әдебиеттік оқу" => Some("literary_reading"),
        // Языки и литература.
        "Казахский язык" => Some("kazakh_language"),
        "Казақ тілі" => Some("kazakh_tili"),
        "Қазақ тілі" => Some("kazakh_tili"),
        "Русский язык" => Some("russian_language"),
        "Орыс тілі" => Some("russian_language"),
        "Уйгурский язык" => Some("uigur_language"),
        "Ұйғыр тілі" => Some("uigur_language"),
        "Узбекский язык" => Some("uzbek_language"),
        "Өзбек тілі" => Some("uzbek_language"),
        "Таджикский язык" => Some("tadzhik_language"),
        "Тәжік тілі" => Some("tadzhik_language"),
        "Английский язык" => Some("english"),
        "Ағылшын тілі" => Some("english"),
        "Немецкий язык" => Some("german"),
        "Неміс тілі" => Some("german"),
        "Французский язык" => Some("french"),
        "Француз тілі" => Some("french"),
        "Иностранный язык (второй). Английский язык" => Some("second_language_english"),
        "Шет тілі (екінші). Ағылшын тілі" => Some("second_language_english"),
        "Иностранный язык (второй). Немецкий язык" => Some("second_language_german"),
        "Шет тілі (екінші). Неміс тілі" => Some("second_language_german"),
        "Иностранный язык (второй). Французский язык" => Some("second_language_french"),
        "Шет тілі (екінші). Француз тілі" => Some("second_language_french"),
        "Казахская литература" => Some("kazakh_literature"),
        "Қазақ әдебиеті" => Some("kazakh_adebieti"),
        "Русская литература" => Some("russian_literature"),
        "Орыс әдебиеті" => Some("russian_literature"),
        "Уйгурская литература" => Some("uigur_literature"),
        "Ұйғыр әдебиеті" => Some("uigur_literature"),
        "Узбекская литература" => Some("uzbek_literature"),
        "Өзбек әдебиеті" => Some("uzbek_literature"),
        "Таджикская литература" => Some("tadzhik_literature"),
        "Тәжік әдебиеті" => Some("tadzhik_literature"),
        "Казахский язык и литература" => Some("kazakh_language_literature"),
        "Қазақ тілі және әдебиеті" => Some("kazakh_language_literature"),
        "Қазақ тілі мен әдебиеті" => Some("kazakh_language_literature"),
        "Русский язык и литература" => Some("russian_language_literature"),
        "Орыс тілі және әдебиеті" => Some("russian_language_literature"),
        "Орыс тілі мен әдебиеті" => Some("russian_language_literature"),
        // Основная и старшая школа.
        "Алгебра" => Some("algebra"),
        "Геометрия" => Some("geometry"),
        "Алгебра и начала анализа" => Some("algebra_analysis"),
        "Алгебра және анализ бастамалары" => Some("algebra_analysis"),
        "Физика" => Some("physics"),
        "Химия" => Some("chemistry"),
        "Биология" => Some("biology"),
        "Информатика" => Some("informatics"),
        "География" => Some("geography"),
        "История Казахстана" => Some("kazakhstan_history"),
        "Қазақстан тарихы" => Some("kazakhstan_history"),
        "Всемирная история" => Some("world_history"),
        "Дүниежүзі тарихы" => Some("world_history"),
        "Основы права" => Some("law_fundamentals"),
        "Құқық негіздері" => Some("law_fundamentals"),
        "Абайтану" => Some("abaitanu"),
        "Краеведение" => Some("regional_studies"),
        "Өлкетану" => Some("regional_studies"),
        "Графика и проектирование" => Some("graphics_design"),
        "Графика және жобалау" => Some("graphics_design"),
        "Начальная военная и технологическая подготовка" => Some("military_training"),
        "Алғашқы әскери және технологиялық дайындық" => Some("military_training"),
        "Основы предпринимательства и бизнеса" => Some("entrepreneurship"),
        "Кәсіпкерлік және бизнес негіздері" => Some("entrepreneurship"),
        "Жаһандық құзыреттер" => Some("global_competencies"),
        "Жаһандық құзыреттілік" => Some("global_competencies"),
        "Глобальные компетенции" => Some("global_competencies"),
        "История становления межэтнических отношений" => Some("interethnic_relations"),
        "Этносаралық қатынастардың қалыптасу тарихы" => Some("interethnic_relations"),
        "Светскость и основы религиоведения" => Some("secularism_religiology"),
        "Зайырлылық және дінтану негіздері" => Some("secularism_religiology"),
        "Алаштану" => Some("alashtanu"),
        _ => None,
    }
}

/// Конвертация русского или казахского месяца в номер.
pub(crate) fn month_number(name: &str) -> Option<&'static str> {
    match name {
        "января" => Some("01"),
        "февраля" => Some("02"),
        "марта" => Some("03"),
        "апреля" => Some("04"),
        "мая" => Some("05"),
        "июня" => Some("06"),
        "июля" => Some("07"),
        "августа" => Some("08"),
        "сентября" => Some("09"),
        "октября" => Some("10"),
        "ноября" => Some("11"),
        "декабря" => Some("12"),
        // Казахские месяцы (в формате «қаңтар», «қаңтарда», «қаңтардағы»).
        "қаңтар" | "қаңтарда" | "қаңтардағы" => Some("01"),
        "ақпан" | "ақпанда" | "ақпандағы" => Some("02"),
        "наурыз" | "наурызда" | "наурыздағы" => Some("03"),
        "сәуір" | "сәуірде" | "сәуірдегі" => Some("04"),
        "мамыр" | "мамырда" | "мамырдағы" => Some("05"),
        "маусым" | "маусымда" | "маусымдағы" => Some("06"),
        "шілде" | "шілдеде" | "шілдедегі" => Some("07"),
        "тамыз" | "тамызда" | "тамыздағы" => Some("08"),
        "қыркүйек" | "қыркүйекте" | "қыркүйектегі" => Some("09"),
        "қазан" | "қазанда" | "қазандағы" => Some("10"),
        "қараша" | "қарашада" | "қарашадағы" => Some("11"),
        "желтоқсан" | "желтоқсанда" | "желтоқсандағы" => Some("12"),
        _ => None,
    }
}

/// Нормализация строки: zero-width, схлопывание пробелов.
/// (Буква Ұ (U+04B0) больше не заменяется на «ё» — казахские названия
/// предметов и тексты целей хранятся в оригинале.)
pub(crate) fn normalize(s: &str) -> String {
    s.replace('\u{200B}', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Признак строки-заголовка колонок таблицы («7 класс 8 класс 9 класс»).
fn is_column_header(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return true;
    }
    // Маркеры страниц.
    if t.starts_with("===== PAGE") {
        return true;
    }
    // Заголовки колонок классов.
    if t.contains("класс") {
        // Без кода цели колонки классов — всегда заголовок (или якорь).
        return !line_contains_code(t);
    }
    // Заголовок таблицы целей биологии 10-11.
    if t.contains("Раздел Подраздел") || t.contains("Подраздел Цели обучения") {
        return true;
    }
    // Заголовки колонок языковых таблиц («Основные навыки Цели обучения»).
    if t.contains("Основные навыки") && t.contains("Цели обучения") {
        return true;
    }
    // Заголовки разделов речевой деятельности (одним словом, без кода и текста).
    if t == "Аудирование"
        || t == "Слушание"
        || t == "Говорение"
        || t == "Чтение"
        || t == "Письмо"
    {
        return true;
    }
    // Якоря «Обучающиеся должны…» (повторяются внутри таблицы химии).
    if t.contains("Обучающ") && t.contains("должн") {
        return true;
    }
    // Заголовки разделов таблицы («Раздел 1. Числа»).
    if t.starts_with("Раздел ") && !line_contains_code(t) {
        return true;
    }
    false
}

/// Признак хвостового абзаца документа внутри зоны целей: «15. Распределение
/// часов на изучение раздела и тем…», «14. Количество часов на изучение раздела
/// и тем распределяется учителем», «16. Настоящая учебная программа реализуется
/// в соответствии с Долгосрочным планом…», «9. При среднесрочном планировании,
/// подразделы в разделе должны перемещаться…». Такие строки стоят после
/// последней цели перед «Параграф 3» и к описанию целей не относятся.
fn is_document_trailer(line: &str) -> bool {
    let t = line.trim();
    // «N. Распределение часов…» (все формулировки: «на изучение раздела и тем»,
    // «в четверти по разделам и внутри разделов», «по отделам за четверть» и т.д.).
    if t.contains("Распределение часов") {
        return true;
    }
    // «N. Количество часов на изучение раздела и тем распределяется учителем».
    if t.contains("Количество часов на изучение") {
        return true;
    }
    // «N. Настоящая учебная программа реализуется в соответствии с Долгосрочным планом…»
    if t.contains("Настоящая учебная программа реализуется в соответствии с Долгосрочн") {
        return true;
    }
    // «N. При среднесрочном планировании, подразделы в разделе должны перемещаться…»
    if t.contains("При среднесрочном планировании") {
        return true;
    }
    false
}

/// Проверка: строка содержит полный код цели (класс.раздел.подраздел.номер).
fn line_contains_code(line: &str) -> bool {
    find_objective_code(line).is_some()
}

/// Признак строки, заканчивающейся неполным кодом цели: «…анализирова ние9.1.1.»
/// (последняя цифра кода перенесена на следующую строку матричной таблицы).
/// Такая строка объединяется со следующей, если та начинается с цифры.
/// Строка-заголовок с кодами колонок («7.1.1. 8.1.1. 9.1.1.», «10.1. 11.1.»)
/// не является разорванным кодом: это либо несколько токенов, либо один
/// полный 4-частный код («10.1. 11.1.»).
fn broken_code_prefix(line: &str) -> bool {
    let re = objective_code_re();
    let mut tokens = re.find_iter(line);
    let first = tokens.next();
    let second = tokens.next();
    match (first, second) {
        (Some(m), None) => {
            let rest = &line[m.end()..];
            // Строка должна заканчиваться точкой после кода.
            if !(rest.starts_with('.') && rest[1..].trim().is_empty()) {
                return false;
            }
            // Разорванный код — это 3 части (без номера цели): «9.1.1».
            // Полный 4-частный код (даже со случайным пробелом) — не разрыв.
            m.as_str().matches('.').count() == 2
        }
        _ => false,
    }
}

fn objective_code_re() -> &'static regex::Regex {
    use std::sync::OnceLock;
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    // Коды склеены с текстом без пробела («виде8.1.1.1» / «8.1.1.1усвоить»).
    // Форматы: 4-частный (класс.раздел.подраздел.номер), 3-частный
    // (класс.раздел.номер — геометрия 10-11) и коды с пробелами вокруг точек
    // (начальная школа: «1 . 1 . 1 . 1», «3.1.4. 2»). Границы — вручную.
    RE.get_or_init(|| {
        // Первая группа допускает пробел между цифрами класса («1 0» = 10) —
        // в матричных таблицах «10» иногда разорван переносом строки.
        regex::Regex::new(r"(\d\s?\d?)\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})(?:\s*\.\s*(\d{1,2}))?")
            .unwrap()
    })
}

/// Результат распознавания кода: (grade, section, subsection, objective).
/// Для 3-частного кода subsection отсутствует — subsection = 1 (нет деления),
/// objective_number = третья часть.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CodeParts {
    pub(crate) grade: i64,
    pub(crate) section_number: i64,
    pub(crate) subsection_number: i64,
    pub(crate) objective_number: i64,
}

/// Допустимый диапазон классов: 1-11, плюс 12 для документов «10-11 (12)»
/// (Русский язык и литература, Английский язык и др., введены приказом 05.03.2024).
pub(crate) fn grade_in_range(g: i64) -> bool {
    (1..=12).contains(&g)
}

/// Ищет все вхождения кодов целей в строке с проверкой границ.
/// Матричные таблицы склеивают несколько целей в одну строку
/// («...конструкции11.5.2 использовать ... 12.5.2 использовать ...»),
/// поэтому в строке может быть 2+ кода — каждый становится своей целью.
pub(crate) fn find_objective_codes(line: &str) -> Vec<(regex::Match<'_>, CodeParts)> {
    let re = objective_code_re();
    let mut out = Vec::new();
    for m in re.find_iter(line) {
        let left_ok = m
            .start()
            .checked_sub(1)
            .and_then(|i| line.as_bytes().get(i))
            .map(|b| !b.is_ascii_digit())
            .unwrap_or(true);
        let right_ok = line
            .as_bytes()
            .get(m.end())
            .map(|b| !b.is_ascii_digit() && *b != b'.')
            .unwrap_or(true);
        if !(left_ok && right_ok) {
            continue;
        }
        let Some(parts) = parse_code(m.as_str()) else { continue };
        if !grade_in_range(parts.grade) {
            continue;
        }
        out.push((m, parts));
    }
    out
}

/// Вариант find_objective_codes для HTML-источника: допускает точку сразу
/// после кода цели, если далее идёт пробел и не-цифра (описание). В HTML
/// некоторые цели записаны как «4.2.2.4. декорировать …» — точка после кода.
/// Заголовки колонок матричных таблиц («7.1.1. 8.1.1.», «10.1. 11.1.») при
/// этом по-прежнему отбрасываются: после их точки идёт цифра или конец строки.
pub(crate) fn find_objective_codes_html(line: &str) -> Vec<(regex::Match<'_>, CodeParts)> {
    let re = objective_code_re();
    let mut out = Vec::new();
    for m in re.find_iter(line) {
        let left_ok = m
            .start()
            .checked_sub(1)
            .and_then(|i| line.as_bytes().get(i))
            .map(|b| !b.is_ascii_digit())
            .unwrap_or(true);
        let right_ok = match line.as_bytes().get(m.end()) {
            Some(b'.') => {
                // Точка после кода допустима, только если за ней следует
                // описание (не-цифра, не-пробел) — а не следующий код-заголовок.
                let rest = &line[m.end() + 1..];
                let trimmed = rest.trim_start();
                !trimmed.is_empty()
                    && !trimmed
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit() || c == '.' || c.is_whitespace())
                        .unwrap_or(true)
            }
            Some(b) => !b.is_ascii_digit() && *b != b'.',
            None => true,
        };
        if !(left_ok && right_ok) {
            continue;
        }
        let Some(parts) = parse_code(m.as_str()) else { continue };
        if !grade_in_range(parts.grade) {
            continue;
        }
        out.push((m, parts));
    }
    out
}

/// Ищет первое вхождение кода цели с проверкой границ.
/// Слева не должно быть цифры (не часть длинного числа), справа — ни
/// цифры, ни точки (точка после числа — это заголовки колонок `7.1.1. 8.1.1.`).
/// Латинская буква слева допустима — в иностранных языках код приклеен
/// к английскому тексту («words4.1.1.1»).
/// Класс «10» в матричных таблицах может быть разорван переносом: «1 0 . 4 . 1 . 2»
/// (пробел между цифрами) — распознаётся как 10-й класс.
fn find_objective_code(line: &str) -> Option<(regex::Match<'_>, CodeParts)> {
    find_objective_codes(line).into_iter().next()
}

/// Разбирает код цели: 4-частный (класс.раздел.подраздел.номер) или
/// 3-частный (класс.раздел.номер, геометрия 10-11 — подраздел отсутствует).
/// Пробелы вокруг точек игнорируются (начальная школа: «1 . 1 . 1 . 1»).
pub(crate) fn parse_code(code: &str) -> Option<CodeParts> {
    let compact: String = code.split_whitespace().collect();
    let mut it = compact.split('.');
    let grade = it.next()?.parse().ok()?;
    let section_number = it.next()?.parse().ok()?;
    let third = it.next()?.parse().ok()?;
    if let Some(n) = it.next() {
        Some(CodeParts {
            grade,
            section_number,
            subsection_number: third,
            objective_number: n.parse().ok()?,
        })
    } else {
        Some(CodeParts {
            grade,
            section_number,
            subsection_number: 1,
            objective_number: third,
        })
    }
}

/// Имя предмета в кавычках заголовка «Типовая учебная программа по …».
/// Название может переноситься на следующую строку («Иностранный язык (второй).
/// Французский язык»), поэтому объединяем до 3 строк и берём текст между кавычек.
fn subject_name_from_title(lines: &[&str], title_index: usize) -> Option<String> {
    let mut acc = String::new();
    for i in title_index..(title_index + 3).min(lines.len()) {
        let line = lines[i].trim();
        if !acc.is_empty() {
            acc.push(' ');
        }
        acc.push_str(line);
        if let Some(open) = acc.find('"') {
            let after = &acc[open + 1..];
            if let Some(close) = after.find('"') {
                let name = after[..close].trim();
                return Some(normalize(name));
            }
        }
    }
    None
}

/// Язык обучения по предмету: казахские предметы — "KK", остальные — "RU".
/// Некоторые предметы существуют в обоих вариантах («Қазақ тілі» vs
/// «Казахский язык»); язык выводится из slug-идентификатора предмета.
pub(crate) fn language_for_subject(subject_id: &str) -> &'static str {
    match subject_id {
        "ana_tili"
        | "kazakh_tili"
        | "kazakh_language"
        | "kazakh_adebieti"
        | "kazakh_literature"
        | "kazakh_language_literature"
        | "abaitanu" => "KK",
        _ => "RU",
    }
}

/// Диапазон допустимых классов документа из строки «7-9» / «10-11» / «1-1».
/// В приказе 05.03.2024 появились документы «для 10-11 (12) классов», где есть
/// цели 12-го класса (их target_grades парсится как «10-11»). 12-й класс
/// легитимен только если в исходном заголовке был «(12)».
pub(crate) fn grades_from_target(target_grades: &str, has_grade_12: bool) -> std::ops::RangeInclusive<i64> {
    let (lo, hi) = if let Some((lo, hi)) = target_grades.split_once('-') {
        let lo = lo.trim().parse::<i64>().unwrap_or(1);
        let hi = hi.trim().parse::<i64>().unwrap_or(12);
        (lo, hi)
    } else {
        (1, 12)
    };
    let hi = if has_grade_12 { hi.max(12) } else { hi };
    lo..=hi
}

/// Разбирает один документ ТУП (метаданные + зона целей) из массива строк.
fn parse_document_body(lines: &[&str], title_index: usize) -> Result<ParsedTupDocument, TupParseError> {
    let title = lines[title_index].trim();
    let title_next = lines
        .get(title_index + 1)
        .map(|s| s.trim())
        .unwrap_or_default();
    let full_title = format!("{title} {title_next}");

    // Предмет: имя в кавычках (с учётом переноса).
    let name = subject_name_from_title(lines, title_index)
        .ok_or_else(|| TupParseError::UnknownSubject(full_title.clone()))?;
    let subject_id = subject_slug(&name)
        .ok_or_else(|| TupParseError::UnknownSubject(name.clone()))?
        .to_string();

    // Диапазон классов: «для 7-9 классов», «для 10-11», «для 7- 9»,
    // «10-11-классов», одиночные «для 1 класса» / «для 9 класса».
    let grade_re = regex::Regex::new(r"для\s+(\d{1,2})\s*-\s*(\d{1,2})").unwrap();
    let single_re = regex::Regex::new(r"для\s+(\d{1,2})\s+класса").unwrap();
    let target_grades = if let Some(cap) = grade_re.captures(&full_title) {
        format!("{}-{}", &cap[1], &cap[2])
    } else if let Some(cap) = single_re.captures(&full_title) {
        let g = &cap[1];
        format!("{g}-{g}")
    } else {
        return Err(TupParseError::MissingGrades(full_title.clone()));
    };

    // Направление: естественно-математическое / общественно-гуманитарное.
    let direction = if full_title.contains("естественно-математического") {
        TupDirection::Emn
    } else if full_title.contains("общественно-гуманитарного") {
        TupDirection::Ogn
    } else {
        TupDirection::Common
    };

    // Язык: выводится из предмета (казахские предметы — казахский язык).
    let language = language_for_subject(&subject_id).to_string();

    // Приказ: «от 16 сентября 2022 года № 399» — в блоке перед заголовком.
    let (order_number, order_date) = order_meta(lines, title_index);

    // Номер приложения: «Приложение N» перед заголовком или «Сноска. Приложение N» после.
    let appendix_number = appendix_number(lines, title_index);

    // Зона целей: от заголовка «Параграф 2. Система целей обучения» (в некоторых
    // документах «Система образовательных целей:» / «Система целей обучения:»)
    // до «Параграф 3» (долгосрочный план).
    let zone_start = lines[title_index..]
        .iter()
        .position(|l| {
            let t = l.trim();
            t.contains("Параграф 2") && t.contains("Система целей обучения")
                || t.contains("Система образовательных целей:")
                || (t.contains("Система целей обучения") && t.contains(':'))
        })
        .map(|p| title_index + p)
        .or_else(|| {
            lines[title_index..]
                .iter()
                .position(|l| l.contains("Система целей обучения"))
                .map(|p| title_index + p)
        })
        .ok_or(TupParseError::MissingObjectivesZone)?;
    let zone_end = lines[zone_start..]
        .iter()
        .position(|l| l.contains("Параграф 3"))
        .map(|p| zone_start + p)
        .unwrap_or(lines.len());

    let zone = &lines[zone_start..zone_end];

    // Якорь таблицы — начало списка целей. Варианты:
    // - «Обучающийся должен» / «Обучающиеся должны»;
    // - «Обучающиеся:» / «Учащиеся должны уметь» (5-9, 10-11);
    // - «…Система целей обучения:» / «…Система образовательных целей:»
    //   / «…Цели обучения определены в виде ожидаемого результата:» (началка);
    // - «…Система целей обучения расписана/дана/представлена»;
    // - «1) раздел "…":» (иностранные языки 3-4);
    // - «Раздел ПодразделЦели обучения» / «Основные навыки Цели обучения:»
    //   / «Раздел ПодразделОбразовательный результат» (10-11).
    let anchor = zone
        .iter()
        .position(|l| {
            let t = l.trim();
            t.contains("Обучающ") && t.contains("долж")
                || t == "Обучающиеся:"
                || t.starts_with("Обучающиеся")
                || t.contains("Учащиеся должны")
                || t.contains("Система целей обучения расписан")
                || t.contains("Система целей обучения дана")
                || t.contains("Система целей обучения представлена")
                || (t.contains("Система целей обучения") && t.ends_with(':'))
                || t.contains("Система образовательных целей:")
                || t.contains("Цели обучения определены в виде ожидаемого результата")
                || (t.starts_with("1) ") && t.contains("раздел ") && t.contains(':'))
                || (t.starts_with("1) Направление") && t.contains(':'))
                || t.contains("Раздел ПодразделЦели обучения")
                || t.contains("Разделы ПодразделыЦели обучения")
                || t.contains("Раздел ПодразделОбразовательный результат")
                || t.contains("Основные навыки Цели обучения:")
        })
        .ok_or(TupParseError::MissingObjectivesAnchor)?;

    // «10-11 (12)» часто разорвано переносом: «10-11 (» + «12)». Нормализуем
    // пробелы, чтобы «( 12)» / «10-11 (12)» распознавались одинаково.
    let has_grade_12 = {
        let compact: String = full_title.chars().filter(|c| !c.is_whitespace()).collect();
        compact.contains("(12)") && compact.contains("10-11")
    };
    let objectives = extract_objectives(&zone[anchor + 1..], grades_from_target(&target_grades, has_grade_12));

    Ok(ParsedTupDocument {
        order_number,
        order_date,
        appendix_number,
        subject_id,
        language,
        target_grades,
        direction,
        objectives,
    })
}

/// Метаданные приказа из блока перед заголовком.
fn order_meta(lines: &[&str], title_index: usize) -> (String, String) {
    let window_start = title_index.saturating_sub(6);
    let window = &lines[window_start..title_index];
    let order_re = regex::Regex::new(r"№\s*(\d+)").unwrap();
    let date_re = regex::Regex::new(r"от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+года").unwrap();

    let mut number = "399".to_string();
    let mut date = "2022-09-16".to_string();
    for line in window {
        if let Some(c) = order_re.captures(line) {
            number = c[1].to_string();
        }
        if let Some(c) = date_re.captures(line) {
            let day = &c[1];
            if let Some(month) = month_number(&c[2]) {
                date = format!("{}-{}-{}", &c[3], month, day);
            }
        }
    }
    (number, date)
}

/// Номер приложения: строка «Приложение N» в начале документа
/// или «Сноска. Приложение N» в первых строках после заголовка.
fn appendix_number(lines: &[&str], title_index: usize) -> i64 {
    let re = regex::Regex::new(r"Приложение\s+(\d+)").unwrap();
    // До заголовка — блок «Приложение N».
    let before = title_index.saturating_sub(8)..title_index;
    for line in &lines[before] {
        if let Some(c) = re.captures(line.trim()) {
            return c[1].parse().unwrap_or(0);
        }
    }
    // После заголовка — «Сноска. Приложение N» (некоторые документы 10-11).
    let after = title_index..(title_index + 14).min(lines.len());
    for line in &lines[after] {
        if line.contains("Сноска. Приложение") {
            if let Some(c) = re.captures(line) {
                return c[1].parse().unwrap_or(0);
            }
        }
    }
    0
}

/// Признак строки-заголовка подраздела без кода («1.4 Правильное применение
/// языковых норм в»). Такие строки — левая колонка таблицы целей; код цели
/// стоит на следующей строке (или ниже). Заголовок отличается от продолжения
/// описания тем, что его «раздел.подраздел» не совпадает с текущей целью.
fn is_subsection_header(line: &str, current: &Option<(ParsedObjective, String)>) -> bool {
    let t = line.trim();
    // «N.M <Заголовок с заглавной буквы>».
    let Some((n, m)) = parse_subsection_prefix(t) else {
        return false;
    };
    match current {
        // До первой цели всё, что похоже на заголовок, — заголовок.
        None => true,
        Some((obj, _)) => {
            // Совпадает с подразделом текущей цели — это продолжение описания.
            // Разошлось — начался заголовок нового подраздела.
            obj.section_number != n || obj.subsection_number != m
        }
    }
}

/// Разбирает ведущий префикс «N.M » заголовка подраздела.
fn parse_subsection_prefix(t: &str) -> Option<(i64, i64)> {
    let bytes = t.as_bytes();
    let dot = bytes.iter().position(|&b| b == b'.')?;
    let n: i64 = t[..dot].trim().parse().ok()?;
    let after = &t[dot + 1..];
    let after = after.trim_start();
    let m_str: String = after
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if m_str.is_empty() {
        return None;
    }
    let m: i64 = m_str.parse().ok()?;
    // После «N.M » обязательна заглавная буква (название подраздела).
    let rest = &after[m_str.len()..];
    let rest = rest.trim_start();
    let starts_cap = rest
        .chars()
        .next()
        .map(|c| c.is_uppercase())
        .unwrap_or(false);
    if !starts_cap {
        return None;
    }
    Some((n, m))
}

/// Обрабатывает строку, содержащую один или несколько кодов целей.
/// Матричные таблицы склеивают несколько целей в одну строку
/// («...конструкции11.5.2 использовать ... 12.5.2 использовать ...») —
/// каждый код становится своей целью; описание — текст между кодом и
/// следующим кодом (для последней цели — до конца строки).
fn process_code_line(
    line: &str,
    codes: &[(regex::Match<'_>, CodeParts)],
    current: &mut Option<(ParsedObjective, String)>,
    objectives: &mut Vec<ParsedObjective>,
) {
    let first = &codes[0];
    let prefix = &line[..first.0.start()];

    // Если перед кодом есть текст — это либо продолжение описания
    // предыдущей цели (подраздел тот же), либо заголовок нового
    // подраздела (подраздел сменился). Продолжение приклеиваем,
    // заголовок отбрасываем.
    if let Some((mut prev, mut desc)) = current.take() {
        let same_subsection = prev.section_number == first.1.section_number
            && prev.subsection_number == first.1.subsection_number;
        if same_subsection && !prefix.trim().is_empty() {
            desc.push(' ');
            desc.push_str(prefix.trim());
        }
        prev.description = desc.trim().to_string();
        objectives.push(prev);
    }

    for (i, (m, parts)) in codes.iter().enumerate() {
        let after_start = m.end();
        let after_end = codes.get(i + 1).map(|(nm, _)| nm.start()).unwrap_or(line.len());
        let after = line[after_start..after_end]
            .trim()
            .trim_start_matches(['-', '–', ':'])
            .trim()
            .to_string();
        let objective = ParsedObjective {
            grade: parts.grade,
            section_number: parts.section_number,
            subsection_number: parts.subsection_number,
            objective_number: parts.objective_number,
            code: m.as_str().split_whitespace().collect::<String>(),
            description: String::new(),
        };
        if i + 1 == codes.len() {
            *current = Some((objective, after));
        } else {
            let mut complete = objective;
            complete.description = after;
            objectives.push(complete);
        }
    }
}

/// Извлечение целей из строк таблицы (после якоря).
/// `valid_grades` — допустимые классы документа (например 1..=4, 5..=9,
/// 10..=12 для «10-11 (12)»). Коды классов вне диапазона — артефакты склейки
/// («12.1.2.3» вместо «2.1.2.3» в документе 1-4) и отбрасываются.
fn extract_objectives(zone: &[&str], valid_grades: std::ops::RangeInclusive<i64>) -> Vec<ParsedObjective> {
    let mut objectives: Vec<ParsedObjective> = Vec::new();
    // Текущая цель в процессе сборки (код известен, текст дополняется).
    let mut current: Option<(ParsedObjective, String)> = None;
    // Внутри заголовка подраздела («1.4 Правильное применение языковых норм»):
    // строки без кода — продолжение заголовка, к описанию цели не относятся.
    let mut in_subsection_header = false;

    let mut i = 0;
    while i < zone.len() {
        let raw = zone[i];
        let mut line = normalize(raw);
        if line.is_empty() {
            i += 1;
            continue;
        }
        // Хвост документа («15. Распределение часов…», «16. …Долгосрочным планом…»)
        // завершает зону целей — дальше идут только служебные абзацы.
        if is_document_trailer(&line) {
            break;
        }
        if is_column_header(&line) {
            i += 1;
            continue;
        }

        // Код цели, разорванный переносом строки: «…9.1.1.» + «1 умени…»
        // (матричные таблицы переносят последнюю цифру кода на новую строку).
        // Объединяем с следующей строкой, если она начинается с цифры.
        if !line_contains_code(&line) && broken_code_prefix(&line) {
            let mut j = i + 1;
            let mut next = String::new();
            while j < zone.len() {
                let n = normalize(zone[j]);
                if !n.is_empty() {
                    next = n;
                    break;
                }
                j += 1;
            }
            if next.as_bytes().first().map(|b| b.is_ascii_digit()).unwrap_or(false) {
                line = format!("{line} {next}");
                i = j + 1;
                continue;
            }
        }

        let raw_codes = find_objective_codes(&line);
        // Коды с классом вне диапазона документа («12.1.2.3» в документе 1-4) —
        // артефакты склейки (число из описания прилипло к коду). Если в строке
        // вообще были коды, но все вне диапазона — строку пропускаем целиком.
        if !raw_codes.is_empty() {
            let valid: Vec<(regex::Match, CodeParts)> = raw_codes
                .iter()
                .copied()
                .filter(|(_, p)| valid_grades.contains(&p.grade))
                .collect();
            if valid.is_empty() {
                i += 1;
                continue;
            }
            // Строка содержит цели (возможно, несколько).
            in_subsection_header = false;
            process_code_line(&line, &valid, &mut current, &mut objectives);
            i += 1;
            continue;
        }

        // В строке нет кодов.
        // Заголовок подраздела без кода («1.4 Правильное применение…»):
        // начинаем режим пропуска строк до появления кода.
        if is_subsection_header(&line, &current) {
            in_subsection_header = true;
            i += 1;
            continue;
        }
        // Продолжение заголовка подраздела — пропускаем.
        if in_subsection_header {
            i += 1;
            continue;
        }
        // Продолжение текста текущей цели.
        if let Some((_, desc)) = current.as_mut() {
            desc.push(' ');
            desc.push_str(&line);
        }
        i += 1;
    }

    if let Some((mut prev, desc)) = current.take() {
        prev.description = desc.trim().to_string();
        objectives.push(prev);
    }

    objectives
}

/// Разбирает полный текст файла ТУП на отдельные документы.
/// Документы, которые не удалось распознать, пропускаются; их причины
/// возвращаются в `errors` (пара <строка заголовка, причина>).
pub fn parse_full_with_errors(text: &str) -> (Vec<ParsedTupDocument>, Vec<(usize, String)>) {
    let lines: Vec<&str> = text.lines().collect();
    // Заголовки документов: строки, начинающиеся с «Типовая учебная программа по…».
    // Внутри текста есть ложные вхождения («1. Типовая учебная программа по предмету
    // "…" (далее – программа)») — они начинаются с номера пункта и отбрасываются.
    let titles: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter_map(|(i, l)| {
            if l.trim().starts_with("Типовая учебная программа по") {
                Some(i)
            } else {
                None
            }
        })
        .collect();

    let mut docs = Vec::new();
    let mut errors = Vec::new();
    for (k, &title_index) in titles.iter().enumerate() {
        // Пропускаем предметы вне словаря subject_slug.
        let name = subject_name_from_title(&lines, title_index).unwrap_or_default();
        if subject_slug(&name).is_none() {
            continue;
        }
        // Документы, исключённые приказами («Приложение N исключено»): содержания
        // нет, парсить нечего.
        let excluded = lines
            .iter()
            .skip(title_index + 1)
            .take(6)
            .any(|l| l.contains("исключено приказом") || l.contains("исключено  приказом"));
        if excluded {
            continue;
        }
        // Начало документа: блок «Приложение N» перед заголовком (если есть),
        // иначе — сам заголовок.
        let start = (0..title_index)
            .rev()
            .take(8)
            .find(|&i| lines[i].trim().starts_with("Приложение ") && lines[i].contains(char::is_numeric))
            .unwrap_or(title_index);
        let end = if let Some(&next) = titles.get(k + 1) {
            next
        } else {
            lines.len()
        };
        let body: Vec<&str> = lines[start..end].to_vec();
        match parse_document_body(&body, title_index - start) {
            Ok(doc) if !doc.objectives.is_empty() => docs.push(doc),
            Ok(_) => errors.push((title_index, "0 целей распознано".to_string())),
            Err(e) => errors.push((title_index, e.to_string())),
        }
    }
    (docs, errors)
}

/// Разбирает полный текст файла ТУП; ошибки отдельных документов игнорируются.
pub fn parse_full(text: &str) -> Result<Vec<ParsedTupDocument>, TupParseError> {
    let (docs, _errors) = parse_full_with_errors(text);
    Ok(docs)
}

/// Сборка доменной модели документа ТУП из распознанного.
pub fn to_domain(parsed: &ParsedTupDocument) -> TupDocument {
    TupDocument::new(
        parsed.order_number.clone(),
        parsed.order_date.clone(),
        parsed.appendix_number,
        parsed.subject_id.clone(),
        parsed.language.clone(),
        parsed.target_grades.clone(),
        parsed.direction,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_yo_and_zero_width() {
        assert_eq!(normalize("четвертое\u{200B} число"), "четвертое число");
        assert_eq!(normalize("5.1.1.1 5.1.1.2"), "5.1.1.1 5.1.1.2");
    }

    #[test]
    fn recognizes_subject_slugs() {
        assert_eq!(subject_slug("Алгебра"), Some("algebra"));
        assert_eq!(subject_slug("Алгебра и начала анализа"), Some("algebra_analysis"));
        assert_eq!(subject_slug("Геометрия"), Some("geometry"));
        assert_eq!(subject_slug("Химия"), Some("chemistry"));
        assert_eq!(subject_slug("Нечто"), None);
    }

    #[test]
    fn parses_code_parts() {
        let p4 = CodeParts { grade: 7, section_number: 2, subsection_number: 1, objective_number: 4 };
        assert_eq!(parse_code("7.2.1.4"), Some(p4));
        let p4b = CodeParts { grade: 9, section_number: 3, subsection_number: 2, objective_number: 25 };
        assert_eq!(parse_code("9.3.2.25"), Some(p4b));
        // 3-частный код геометрии 10-11: класс.раздел.номер.
        let p3 = CodeParts { grade: 11, section_number: 1, subsection_number: 1, objective_number: 10 };
        assert_eq!(parse_code("11.1.10"), Some(p3));
    }

    #[test]
    fn finds_three_part_codes() {
        // «10.1.» — заголовок колонки, «10.1.1» — цель. Склейка без пробела.
        let line = "1. Понятие о геометрических фигурах10.1. 11.1. 10.1.1 - знать";
        let (m, parts) = find_objective_code(line).unwrap();
        assert_eq!(m.as_str(), "10.1.1");
        assert_eq!(parts.grade, 10);
        assert_eq!(parts.section_number, 1);
        assert_eq!(parts.subsection_number, 1);
        assert_eq!(parts.objective_number, 1);
        // «10.1. 11.1.» — заголовки колонок не должны распознаваться как цели.
        let header = "1. Понятие о геометрических фигурах10.1. 11.1.";
        assert!(find_objective_code(header).is_none());
    }

    #[test]
    fn split_grade_digits_are_merged() {
        // «10» разорван переносом в матричной таблице: «1 0 . 4 . 1 . 2».
        let line = "Молекулярная биология и биохимия1 0 . 4 . 1 . 2  -  классифицировать";
        let (m, parts) = find_objective_code(line).unwrap();
        assert_eq!(m.as_str(), "1 0 . 4 . 1 . 2");
        assert_eq!(parts.grade, 10);
        assert_eq!(parts.section_number, 4);
        assert_eq!(parts.subsection_number, 1);
        assert_eq!(parts.objective_number, 2);
    }

    #[test]
    fn out_of_range_grades_are_rejected() {
        // Склейки с числами-артефактами («94», «53») не должны давать цели.
        assert!(find_objective_code("6, 7, 8, 94 . 1 . 2 . 4").is_none());
        assert!(find_objective_code("2, 3, 4, 53.1.2.4").is_none());
        assert!(find_objective_code("246:24.1.2.10").is_none());
        // Класс 11 и 12 допустимы (документы «10-11 (12)»).
        let (_, p11) = find_objective_code("11.4.7 соблюдать").unwrap();
        assert_eq!(p11.grade, 11);
        let (_, p) = find_objective_code("12.4.7 соблюдать").unwrap();
        assert_eq!(p.grade, 12);
    }

    #[test]
    fn extracts_three_part_objectives() {
        let zone = vec![
            "Раздел 10 класс 11 класс",
            "1. Понятие о геометрических фигурах10.1. 11.1.",
            "10.1.1 - знать определение",
            "тетраэдра и его элементов;",
            "10.1.2 - знать определение",
            "11.1.10 - уметь строить",
            "комбинации геометрических тел;",
        ];
        let objs = extract_objectives(&zone, 1..=12);
        assert_eq!(objs.len(), 3);
        assert_eq!(objs[0].code_str(), "10.1.1");
        assert_eq!(objs[0].grade, 10);
        assert_eq!(objs[0].objective_number, 1);
        assert_eq!(objs[0].description, "знать определение тетраэдра и его элементов;");
        assert_eq!(objs[1].code_str(), "10.1.2");
        assert_eq!(objs[2].code_str(), "11.1.10");
        assert_eq!(objs[2].grade, 11);
        assert_eq!(objs[2].objective_number, 10);
        assert_eq!(objs[2].description, "уметь строить комбинации геометрических тел;");
    }

    #[test]
    fn column_headers_are_skipped() {
        assert!(is_column_header("===== PAGE 2407 ====="));
        assert!(is_column_header("Подраздел 7 класс 8 класс 9 класс"));
        assert!(is_column_header("7 класс 8 класс 9 класс"));
        assert!(is_column_header("Раздел 1. Числа"));
        assert!(is_column_header("Обучающиеся должны уметь:"));
        assert!(!is_column_header("7.1.1.1 знать, что изучает"));
    }

    #[test]
    fn document_trailer_is_detected() {
        assert!(is_document_trailer("15. Распределение часов на изучение раздела и тем предоставляется на усмотрение"));
        assert!(is_document_trailer("20. Распределение часов в четверти по разделам и внутри разделов варьируется по"));
        assert!(is_document_trailer("14. Количество часов на изучение раздела и тем распределяется учителем."));
        assert!(is_document_trailer("16. Настоящая учебная программа реализуется в соответствии с Долгосрочным"));
        assert!(is_document_trailer("9. При среднесрочном планировании, подразделы в разделе должны перемещаться в"));
        // Не цели: строка с кодом.
        assert!(!is_document_trailer("11.4.2.4 использовать в речи"));
    }

    #[test]
    fn trailer_does_not_glue_to_last_objective() {
        let zone = vec![
            "7.1.1.1 записывать числа в стандартном виде;",
            "7.1.1.2 сравнивать рациональные числа;",
            "15. Распределение часов на изучение раздела и тем предоставляется на усмотрение",
            "учителя.",
            "16. Настоящая учебная программа реализуется в соответствии с Долгосрочным",
            "планом по реализации Типовой учебной программы.",
        ];
        let objs = extract_objectives(&zone, 1..=12);
        assert_eq!(objs.len(), 2);
        assert_eq!(objs[1].code, "7.1.1.2");
        assert_eq!(objs[1].description, "сравнивать рациональные числа;");
    }

    #[test]
    fn extracts_objectives_sequence() {
        let zone = vec![
            "Раздел 1. Числа",
            "1. Понятие о числах и",
            "величинах7.1.1. 8.1.1. 9.1.1.",
            "7.1.1.1 записывать числа ",
            "в стандартном виде8.1.1.1 усвоить понятия ",
            "иррационального и ",
            "действительного чисел;",
            "Решение текстовых задач7.4.2.1 решать задачи, в которых ",
            "неизвестное находится",
            "8.4.2.3 использовать уравнение",
        ];
        let objs = extract_objectives(&zone, 1..=12);
        assert_eq!(objs.len(), 4);
        assert_eq!(objs[0].code_str(), "7.1.1.1");
        assert_eq!(objs[0].description, "записывать числа в стандартном виде");
        assert_eq!(objs[1].code_str(), "8.1.1.1");
        assert_eq!(objs[1].description, "усвоить понятия иррационального и действительного чисел;");
        // Заголовок «Решение текстовых задач» перед 7.4.2.1 отброшен.
        assert_eq!(objs[2].code_str(), "7.4.2.1");
        assert_eq!(objs[2].description, "решать задачи, в которых неизвестное находится");
        assert_eq!(objs[3].code_str(), "8.4.2.3");
        assert_eq!(objs[3].description, "использовать уравнение");
    }

    #[test]
    fn subsection_header_does_not_glue_to_objective() {
        let zone = vec![
            "1.3 Прогнозирование событий",
            "1.1.3.1 прогнозировать содержания",
            "текста по теме и иллюстрациям",
            "1.4 Правильное применение языковых норм в",
            "коммуникативных отношениях1.1.4.1 правильно",
            "применять формы речевого этикета;",
        ];
        let objs = extract_objectives(&zone, 1..=12);
        assert_eq!(objs.len(), 2);
        assert_eq!(objs[0].code_str(), "1.1.3.1");
        assert_eq!(objs[0].description, "прогнозировать содержания текста по теме и иллюстрациям");
        // Заголовок «1.4 …» и его продолжение не приклеились.
        assert_eq!(objs[1].code_str(), "1.1.4.1");
        assert_eq!(objs[1].description, "правильно применять формы речевого этикета;");
    }

    #[test]
    fn out_of_document_grades_are_skipped() {
        // В документе 1-4 класс 12 невозможен — это артефакт склейки:
        // «свойство 0 и 12.1.2.3» на самом деле «…и 1 2.1.2.3» (число из
        // описания прилипло к коду). Такие строки пропускаются.
        let zone = vec![
            "2.1.2.1 применять переместительное свойство",
            "свойство 0 и 12.1.2.3 применять",
            "переместительное, сочетательное свойства",
        ];
        let objs = extract_objectives(&zone, 1..=4);
        assert_eq!(objs.len(), 1);
        assert_eq!(objs[0].code_str(), "2.1.2.1");
        // Строка с классом 12 не создала цели и не приклеилась к предыдущей.
        assert_eq!(objs[0].description, "применять переместительное свойство переместительное, сочетательное свойства");
    }

    #[test]
    fn grade_12_allowed_in_10_11_12_documents() {
        let zone = vec![
            "11.4.7 соблюдать пунктуационные нормы",
            "12.4.7 соблюдать пунктуационные нормы",
        ];
        let objs = extract_objectives(&zone, 10..=12);
        assert_eq!(objs.len(), 2);
        assert_eq!(objs[1].code_str(), "12.4.7");
    }

    #[test]
    fn multi_objective_row_is_split() {
        // Матричная строка склеивает несколько целей: «11.5.2» и «12.5.2».
        let zone = vec![
            "конструкции11.5.2 использовать неполные предложения12.5.2 использовать неполные предложения",
        ];
        let objs = extract_objectives(&zone, 10..=12);
        assert_eq!(objs.len(), 2);
        assert_eq!(objs[0].code_str(), "11.5.2");
        assert_eq!(objs[0].description, "использовать неполные предложения");
        assert_eq!(objs[1].code_str(), "12.5.2");
        assert_eq!(objs[1].description, "использовать неполные предложения");
    }

    #[test]
    fn glued_grade_8_and_9_rows_are_split() {
        // Казахский язык [37]: «8.1.1.1 … анализирова ние9.1.1. 1 умени е …»
        // (код 9-го класса с пробелом перед последней цифрой).
        let zone = vec![
            "8.1.1.1 использован ие стратегий чтения, анализирова ние9.1.1. 1 умени е использовать страт егии чтен",
        ];
        let objs = extract_objectives(&zone, 5..=9);
        assert_eq!(objs.len(), 2);
        assert_eq!(objs[0].code_str(), "8.1.1.1");
        assert_eq!(objs[0].description, "использован ие стратегий чтения, анализирова ние");
        assert_eq!(objs[1].code_str(), "9.1.1.1");
        assert_eq!(objs[1].description, "умени е использовать страт егии чтен");
    }

    #[test]
    fn subsection_header_without_current_is_skipped() {
        let zone = vec![
            "2.1 Числовые и буквенные выражения",
            "2.1.1.1 составлять выражения",
            "по словесной формулировке;",
        ];
        let objs = extract_objectives(&zone, 1..=12);
        assert_eq!(objs.len(), 1);
        assert_eq!(objs[0].code_str(), "2.1.1.1");
        assert_eq!(objs[0].description, "составлять выражения по словесной формулировке;");
    }

    #[test]
    fn continuation_matching_current_subsection_is_kept() {
        // Продолжение описания, начинающееся с «N.M » того же подраздела, —
        // это не заголовок, его нужно сохранить.
        let zone = vec![
            "1.1.3.1 прогнозировать содержания",
            "1.3 абзаца текста по теме;",
        ];
        let objs = extract_objectives(&zone, 1..=12);
        assert_eq!(objs.len(), 1);
        assert_eq!(objs[0].code_str(), "1.1.3.1");
        assert_eq!(objs[0].description, "прогнозировать содержания 1.3 абзаца текста по теме;");
    }

    #[test]
    fn parses_10_11_emn_title() {
        let text = "\
к приказу Министра просвещения
Республики Казахстан
от 16 сентября 2022 года № 399
Типовая учебная программа по учебному предмету \"Алгебра и начала анализа\" для 10-11
классов естественно-математического направления уровня общего среднего образования
Сноска. Приложение 104 - в редакции приказа Министра просвещения РК от 21.11.2022
Глава 2. Организация содержания учебного предмета Параграф 2. Система целей обучения
14. Цели обучения в программе представлены с кодировкой.
15. Обучающийся должен:
Раздел 1. \"Числа\"
Подраздел 10 класс 11 класс
1. Понятие о числах и величинах10.1.1. 11.1.1.
11.1.1.1 - знать определение
комплексного числа и его модуля;
11.1.1.2 - уметь изображать
комплексное число на комплексной плоскости;
Параграф 3. Долгосрочный план по реализации Типовой учебной программы
";
        let docs = parse_full(text).unwrap();
        assert_eq!(docs.len(), 1);
        let doc = &docs[0];
        assert_eq!(doc.subject_id, "algebra_analysis");
        assert_eq!(doc.target_grades, "10-11");
        assert_eq!(doc.direction, TupDirection::Emn);
        assert_eq!(doc.appendix_number, 104);
        assert_eq!(doc.order_number, "399");
        assert_eq!(doc.order_date, "2022-09-16");
        assert_eq!(doc.objectives.len(), 2);
        assert_eq!(doc.objectives[0].code_str(), "11.1.1.1");
        assert_eq!(doc.objectives[0].description, "знать определение комплексного числа и его модуля;");
    }

    #[test]
    fn chemistry_direction_recognized() {
        assert_eq!(direction_from_text("Типовая учебная программа по предмету \"Химия\" для 7- 9 классов уровня основного среднего образования"), TupDirection::Common);
    }

    /// Интеграционная проверка на реальный извлечённый текст ТУП.
    /// Запуск: `$env:TUP_FULL="путь"; cargo test parse_real -- --ignored`
    #[test]
    #[ignore]
    fn parse_real_full_file() {
        let path = std::env::var("TUP_FULL").expect("TUP_FULL не задан");
        let text = std::fs::read_to_string(&path).expect("файл не читается");
        let docs = parse_full(&text).unwrap();
        eprintln!("=== распознано документов: {} ===", docs.len());
        let mut total = 0usize;
        for d in &docs {
            eprintln!(
                "{} | app {} | {} | {:?} | целей: {}",
                d.subject_id, d.appendix_number, d.target_grades, d.direction, d.objectives.len()
            );
            total += d.objectives.len();
        }
        eprintln!("=== всего целей: {total} ===");
        // Полнота: полный экспорт охватывает все ~53 предмета (115 документов,
        // ~10800 целей), включая геометрию 10-11 с 3-частными кодами (app 106/107).        assert_eq!(docs.len(), 115, "ожидалось 115 документов, получено {}", docs.len());
        assert!(total > 10000, "ожидалось >10000 целей, получено {total}");

        let has = |subject: &str, app: i64, grades: &str, dir: TupDirection| {
            docs.iter().any(|d| {
                d.subject_id == subject
                    && d.appendix_number == app
                    && d.target_grades == grades
                    && d.direction == dir
            })
        };
        // 7-9 (общий).
        for (s, a) in [
            ("algebra", 53),
            ("geometry", 54),
            ("informatics", 55),
            ("physics", 57),
            ("chemistry", 58),
            ("biology", 59),
        ] {
            assert!(has(s, a, "5-9", TupDirection::Common) || has(s, a, "7-9", TupDirection::Common),
                "нет документа {s} 7-9 (app {a})");
        }
        // 10-11: ЕМН и ОГН.
        for (s, a) in [
            ("algebra_analysis", 104),
            ("geometry", 106),
            ("informatics", 108),
            ("chemistry", 110),
            ("physics", 112),
            ("biology", 114),
        ] {
            assert!(has(s, a, "10-11", TupDirection::Emn), "нет документа {s} 10-11 ЕМН (app {a})");
        }
        for (s, a) in [
            ("algebra_analysis", 105),
            ("geometry", 107),
            ("informatics", 109),
            ("chemistry", 111),
            ("physics", 113),
            ("biology", 115),
        ] {
            assert!(has(s, a, "10-11", TupDirection::Ogn), "нет документа {s} 10-11 ОГН (app {a})");
        }

        // Геометрия 10-11 использует 3-частные коды — цели присутствуют.
        let geom_emn = docs.iter().find(|d| d.appendix_number == 106).unwrap();
        // В геометрии 10-11 ЕМН смешанный формат кодов:
        // 3-частные (10.1.1) и 4-частные (11.1.4.1, с U+200B между цифрами).
        let three = geom_emn.objectives.iter().filter(|o| o.code.matches('.').count() == 2).count();
        let four = geom_emn.objectives.iter().filter(|o| o.code.matches('.').count() == 3).count();
        eprintln!("geom EMN: 3-part={three}, 4-part={four}, total={}", geom_emn.objectives.len());
        assert!(three >= 60, "геометрия ЕМН: слишком мало 3-частных кодов ({three})");
        assert!(four >= 3, "геометрия ЕМН: 4-частные коды не распознаны ({four})");
        assert_eq!(three + four, geom_emn.objectives.len());
        let geom_ogn = docs.iter().find(|d| d.appendix_number == 107).unwrap();
        assert!(geom_ogn.objectives.len() >= 40, "геометрия ОГН: целей {}", geom_ogn.objectives.len());
    }

    fn direction_from_text(t: &str) -> TupDirection {
        if t.contains("естественно-математического") {
            TupDirection::Emn
        } else if t.contains("общественно-гуманитарного") {
            TupDirection::Ogn
        } else {
            TupDirection::Common
        }
    }

    trait ObjectiveCode {
        fn code_str(&self) -> String;
    }
    impl ObjectiveCode for ParsedObjective {
        fn code_str(&self) -> String {
            self.code.clone()
        }
    }
}

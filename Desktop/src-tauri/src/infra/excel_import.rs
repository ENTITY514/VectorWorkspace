//! Импорт учебного плана и справочников из Excel-шаблона.
//!
//! Заменяет `scripts/import_schedule_from_excel.py`, который умел только
//! разобрать файл и напечатать сводку — записать данные в базу было нечем,
//! поэтому заполненную таблицу некуда было загрузить.
//!
//! Импорт двухфазный: сперва разбор с отчётом о том, что не опозналось,
//! затем — по подтверждению — запись в базу одной транзакцией.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::DbError;

pub const SHEET_ROOMS: &str = "🏫 Кабинеты";
pub const SHEET_TEACHERS: &str = "👨‍🏫 Учителя";
pub const SHEET_CLASSES: &str = "👥 Классы";
pub const SHEET_CURRICULUM: &str = "📚 Учебный план (Нагрузка)";

#[derive(Debug, thiserror::Error)]
pub enum ExcelError {
    #[error("не удалось открыть файл: {0}")]
    Open(String),
    #[error("в книге нет ни одного ожидаемого листа (нужны: «{SHEET_CLASSES}», «{SHEET_TEACHERS}», «{SHEET_ROOMS}», «{SHEET_CURRICULUM}»)")]
    NoSheets,
    #[error("база данных: {0}")]
    Db(#[from] DbError),
}

/// Приводит имя к идентификатору: строчные буквы, разделители — подчёркивания.
/// Повторяет правило из шаблона, иначе ссылки между листами не сойдутся.
pub fn slugify(value: &str) -> String {
    let lowered = value.to_lowercase().replace('ё', "е");
    let mut out = String::with_capacity(lowered.len());
    let mut prev_sep = true;
    for ch in lowered.chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            prev_sep = false;
        } else if !prev_sep {
            out.push('_');
            prev_sep = true;
        }
    }
    out.trim_matches('_').to_string()
}

fn cell(row: &[Data], idx: usize) -> String {
    row.get(idx).map(|c| match c {
        Data::Empty => String::new(),
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => {
            if (f.fract()).abs() < f64::EPSILON {
                format!("{}", *f as i64)
            } else {
                format!("{f}")
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        other => other.to_string().trim().to_string(),
    })
    .unwrap_or_default()
}

fn cell_int(row: &[Data], idx: usize) -> Option<i64> {
    let raw = cell(row, idx);
    raw.split(|c: char| !c.is_ascii_digit())
        .find(|p| !p.is_empty())
        .and_then(|p| p.parse::<i64>().ok())
}

/// «Стандартный» и прочие человеческие названия -> коды схемы.
pub fn normalize_room_type(raw: &str) -> String {
    let r = raw.trim().to_lowercase();
    match r.as_str() {
        "" | "стандартный" | "обычный" | "general" | "кабинет" => "General",
        "спортзал" | "спортивный зал" | "физкультура" | "gym" => "Gym",
        "информатика" | "компьютерный" | "informatics" => "Informatics",
        "химия" | "химлаборатория" | "chemistrylab" => "ChemistryLab",
        "физика" | "физлаборатория" | "physicslab" => "PhysicsLab",
        "биология" | "биолаборатория" | "biologylab" => "BiologyLab",
        "лингафонный" | "языковой" | "languagelab" => "LanguageLab",
        "мастерская" | "труд" | "workshop" => "Workshop",
        _ => "General",
    }
    .to_string()
}

/// «Обычный» / «ЛУО» / «ДО (надомное)» -> коды схемы.
pub fn normalize_class_type(raw: &str) -> String {
    let r = raw.trim().to_lowercase();
    if r.contains("луо") || r.contains("luo") {
        "luo".to_string()
    } else if r.contains("до") || r.contains("надом") {
        "do".to_string()
    } else {
        "normal".to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedRoom {
    pub id: String,
    pub name: String,
    pub room_type: String,
    pub base_teacher_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedTeacher {
    pub id: String,
    pub full_name: String,
    pub base_room_name: Option<String>,
    pub max_daily_lessons: i64,
    pub is_combined: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedClass {
    pub id: String,
    pub grade: i64,
    pub letter: String,
    pub class_type: String,
    pub shift: String,
    pub headcount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedCurriculum {
    pub class_id: String,
    pub subject_id: String,
    pub subject_name: String,
    pub teacher_id: String,
    pub teacher_name: String,
    pub split_teacher2_id: Option<String>,
    pub hours_per_week: i64,
    pub joint_lesson_id: Option<String>,
    pub room_type: Option<String>,
}

/// Результат разбора: данные плюс всё, что не сошлось.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExcelImportPreview {
    pub rooms: Vec<ParsedRoom>,
    pub teachers: Vec<ParsedTeacher>,
    pub classes: Vec<ParsedClass>,
    pub curriculum: Vec<ParsedCurriculum>,
    /// Проблемы, из-за которых строки отброшены или связи не сошлись.
    pub problems: Vec<String>,
    /// Замечания, не мешающие импорту.
    pub warnings: Vec<String>,
}

impl ExcelImportPreview {
    pub fn is_empty(&self) -> bool {
        self.rooms.is_empty()
            && self.teachers.is_empty()
            && self.classes.is_empty()
            && self.curriculum.is_empty()
    }
}

/// Разбирает книгу, ничего не записывая. Отчёт показывается пользователю
/// до того, как что-либо попадёт в базу.
pub fn parse_workbook(path: &Path) -> Result<ExcelImportPreview, ExcelError> {
    let mut wb = open_workbook_auto(path).map_err(|e| ExcelError::Open(e.to_string()))?;
    let sheets: Vec<String> = wb.sheet_names().to_vec();
    let mut out = ExcelImportPreview::default();

    let find = |needle: &str| -> Option<String> {
        sheets.iter().find(|s| s.contains(needle)).cloned()
    };

    // ─── Кабинеты ───
    if let Some(name) = find("Кабинет") {
        if let Ok(range) = wb.worksheet_range(&name) {
            for row in range.rows().skip(1) {
                let id_raw = cell(row, 1);
                let title = cell(row, 2);
                if id_raw.is_empty() && title.is_empty() {
                    continue;
                }
                let id = if id_raw.is_empty() { slugify(&title) } else { id_raw };
                if id.is_empty() {
                    continue;
                }
                let base_teacher = cell(row, 4);
                out.rooms.push(ParsedRoom {
                    name: if title.is_empty() { id.clone() } else { title },
                    room_type: normalize_room_type(&cell(row, 3)),
                    base_teacher_name: (!base_teacher.is_empty() && base_teacher != "—")
                        .then_some(base_teacher),
                    id,
                });
            }
        }
    }

    // ─── Учителя ───
    if let Some(name) = find("Учител") {
        if let Ok(range) = wb.worksheet_range(&name) {
            for row in range.rows().skip(1) {
                let full_name = cell(row, 1);
                if full_name.is_empty() || full_name.contains("[Впишите") {
                    continue;
                }
                let base_room = cell(row, 3);
                out.teachers.push(ParsedTeacher {
                    id: slugify(&full_name),
                    full_name,
                    base_room_name: (!base_room.is_empty() && base_room != "—")
                        .then_some(base_room),
                    max_daily_lessons: cell_int(row, 4).unwrap_or(0).clamp(0, 10),
                    is_combined: cell(row, 5).to_lowercase().starts_with("да"),
                });
            }
        }
    }

    // ─── Классы ───
    if let Some(name) = find("Класс").filter(|n| !n.contains("комплект")) {
        if let Ok(range) = wb.worksheet_range(&name) {
            for row in range.rows().skip(1) {
                let cid = cell(row, 1);
                if cid.is_empty() || cid.contains("[") {
                    continue;
                }
                let grade = cell_int(row, 2).unwrap_or(1).clamp(1, 11);
                let shift_raw = cell(row, 5);
                out.classes.push(ParsedClass {
                    id: cid,
                    grade,
                    letter: cell(row, 3),
                    class_type: normalize_class_type(&cell(row, 4)),
                    shift: if shift_raw.contains('2') { "Second" } else { "First" }.to_string(),
                    // Численность в шаблоне не собирается: для расписания она
                    // не используется, а выдуманное значение вводило бы в
                    // заблуждение. Ставим 1 — минимально допустимое схемой.
                    headcount: 1,
                });
            }
        }
    }

    // ─── Учебный план ───
    if let Some(name) = find("Нагрузка").or_else(|| find("Учебный план")) {
        if let Ok(range) = wb.worksheet_range(&name) {
            for (n, row) in range.rows().enumerate().skip(1) {
                let class_id = cell(row, 1);
                let subject = cell(row, 2);
                let hours = cell_int(row, 3);
                if class_id.is_empty() || subject.is_empty() {
                    continue;
                }
                if subject.contains("[Новый предмет]") {
                    continue;
                }
                let Some(hours) = hours.filter(|h| *h > 0) else {
                    continue;
                };
                if hours > 6 {
                    out.problems.push(format!(
                        "строка {}: {class_id} · {subject} — {hours} ч/нед, схема допускает до 6",
                        n + 1
                    ));
                    continue;
                }
                let teacher_name = cell(row, 4);
                if teacher_name.is_empty() {
                    out.problems.push(format!(
                        "строка {}: {class_id} · {subject} — не указан учитель",
                        n + 1
                    ));
                    continue;
                }
                let t2 = cell(row, 6);
                let joint = cell(row, 7);
                let room_type = cell(row, 8);
                out.curriculum.push(ParsedCurriculum {
                    class_id,
                    subject_id: slugify(&subject),
                    subject_name: subject,
                    teacher_id: slugify(&teacher_name),
                    teacher_name,
                    split_teacher2_id: (!t2.is_empty() && t2 != "—").then(|| slugify(&t2)),
                    hours_per_week: hours,
                    joint_lesson_id: (!joint.is_empty() && joint != "—").then(|| slugify(&joint)),
                    room_type: (!room_type.is_empty()).then(|| normalize_room_type(&room_type)),
                });
            }
        }
    }

    if out.is_empty() {
        return Err(ExcelError::NoSheets);
    }

    check_references(&mut out);
    Ok(out)
}

/// Проверяет, что ссылки между листами сходятся. Это главный источник
/// ошибок при ручном заполнении: опечатка в ФИО рвёт связь с нагрузкой.
fn check_references(p: &mut ExcelImportPreview) {
    let teacher_ids: HashSet<&str> = p.teachers.iter().map(|t| t.id.as_str()).collect();
    let class_ids: HashSet<&str> = p.classes.iter().map(|c| c.id.as_str()).collect();
    let room_names: HashSet<&str> = p.rooms.iter().map(|r| r.name.as_str()).collect();

    let mut unknown_teachers: HashSet<String> = HashSet::new();
    let mut unknown_classes: HashSet<String> = HashSet::new();

    for entry in &p.curriculum {
        if !teacher_ids.contains(entry.teacher_id.as_str()) {
            unknown_teachers.insert(entry.teacher_name.clone());
        }
        if let Some(t2) = &entry.split_teacher2_id {
            if !teacher_ids.contains(t2.as_str()) {
                unknown_teachers.insert(t2.clone());
            }
        }
        if !class_ids.contains(entry.class_id.as_str()) {
            unknown_classes.insert(entry.class_id.clone());
        }
    }

    for t in unknown_teachers {
        p.problems.push(format!(
            "учитель «{t}» есть в нагрузке, но отсутствует на листе «Учителя»"
        ));
    }
    for c in unknown_classes {
        p.problems.push(format!(
            "класс «{c}» есть в нагрузке, но отсутствует на листе «Классы»"
        ));
    }
    for t in &p.teachers {
        if let Some(room) = &t.base_room_name {
            if !room_names.contains(room.as_str()) {
                p.warnings.push(format!(
                    "у учителя «{}» указан кабинет «{room}», которого нет на листе «Кабинеты» — привязка не будет установлена",
                    t.full_name
                ));
            }
        }
    }
    if p.curriculum.is_empty() {
        p.problems.push("лист нагрузки пуст: импортировать нечего".to_string());
    }
}

/// Режим импорта.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportMode {
    /// Дополнить справочники: существующие записи обновляются, лишние
    /// остаются. Подходит, когда книга описывает часть школы.
    Merge,
    /// Заменить справочники целиком: всё, чего нет в книге, удаляется вместе
    /// с расписаниями. Нужен, когда прежние данные недостоверны — иначе
    /// старые записи остаются рядом с новыми и School раздваивается.
    Replace,
}

impl Default for ImportMode {
    fn default() -> Self {
        // По умолчанию — безопасное слияние: замена необратима.
        Self::Merge
    }
}

/// Записывает разобранные данные в базу одной транзакцией.
///
/// Нагрузка заменяется целиком в обоих режимах: частичное слияние оставляло
/// бы «призрачные» строки от прошлых импортов.
pub async fn apply(
    pool: &SqlitePool,
    p: &ExcelImportPreview,
    mode: ImportMode,
) -> Result<ImportSummary, DbError> {
    let mut tx = pool.begin().await?;
    let mut summary = ImportSummary::default();

    // Кабинеты
    // Сопоставление по НАЗВАНИЮ, а не по идентификатору: у таблицы уникально
    // имя, и кабинет из книги с другим id, но тем же названием иначе ронял бы
    // весь импорт нарушением уникальности.
    let existing_room_by_name: HashMap<String, String> =
        sqlx::query_as::<_, (String, String)>("SELECT name, id FROM schedule_rooms")
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .collect();
    let mut room_id_map: HashMap<&str, String> = HashMap::new();
    for r in &p.rooms {
        let effective = existing_room_by_name
            .get(&r.name)
            .cloned()
            .unwrap_or_else(|| r.id.clone());
        room_id_map.insert(r.id.as_str(), effective.clone());
        sqlx::query(
            "INSERT INTO schedule_rooms (id, name, room_type, capacity) VALUES (?1, ?2, ?3, 30)              ON CONFLICT(id) DO UPDATE SET name = excluded.name, room_type = excluded.room_type",
        )
        .bind(&effective)
        .bind(&r.name)
        .bind(&r.room_type)
        .execute(&mut *tx)
        .await?;
        summary.rooms += 1;
    }

    // Учителя. Матрица доступности не перетирается: её редактируют в
    // приложении, и импорт справочника не должен стирать эту работу.
    let room_id_by_name: HashMap<&str, &str> =
        p.rooms.iter().map(|r| (r.name.as_str(), r.id.as_str())).collect();
    for t in &p.teachers {
        let base_room = t
            .base_room_name
            .as_deref()
            .and_then(|n| room_id_by_name.get(n).copied())
            // Идентификатор кабинета — сопоставленный, иначе ссылка укажет
            // на строку, которой в базе нет.
            .and_then(|sheet| room_id_map.get(sheet).map(|s| s.as_str()));
        sqlx::query(
            "INSERT INTO schedule_teachers (id, full_name, base_room_id, max_daily_lessons, availability_json, subject_ids, is_combined) \
             VALUES (?1, ?2, ?3, ?4, '[]', '[]', ?5) \
             ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, \
                 base_room_id = excluded.base_room_id, \
                 max_daily_lessons = excluded.max_daily_lessons, \
                 is_combined = excluded.is_combined",
        )
        .bind(&t.id)
        .bind(&t.full_name)
        .bind(base_room)
        .bind(t.max_daily_lessons)
        .bind(t.is_combined)
        .execute(&mut *tx)
        .await?;
        summary.teachers += 1;
    }

    // Обратная привязка кабинет -> учитель
    for r in &p.rooms {
        if let Some(name) = &r.base_teacher_name {
            let tid = p.teachers.iter().find(|t| &t.full_name == name).map(|t| t.id.as_str());
            if let Some(tid) = tid {
                sqlx::query("UPDATE schedule_rooms SET base_teacher_id = ?1 WHERE id = ?2")
                    .bind(tid)
                    .bind(room_id_map.get(r.id.as_str()).unwrap_or(&r.id))
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    // Классы.
    //
    // Сопоставление по естественному ключу (параллель, литера, тип), а не по
    // идентификатору: в книге класс называется «4 ЛУО», в базе — «4_luo».
    // Вставка по id ломалась бы об уникальность (grade, letter, class_type),
    // а новый идентификатор оторвал бы класс от накопленных расписаний.
    let existing_class_by_key: HashMap<(i64, String, String), String> =
        sqlx::query_as::<_, (String, i64, String, String)>(
            "SELECT id, grade, COALESCE(letter, ''), COALESCE(class_type, 'normal') FROM schedule_classes",
        )
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|(id, grade, letter, ctype)| ((grade, letter, ctype), id))
        .collect();

    let mut class_id_map: HashMap<&str, String> = HashMap::new();
    for c in &p.classes {
        let key = (c.grade, c.letter.clone(), c.class_type.clone());
        let effective = existing_class_by_key.get(&key).cloned().unwrap_or_else(|| c.id.clone());
        sqlx::query(
            "INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type)              VALUES (?1, ?2, ?3, ?4, ?5, ?6)              ON CONFLICT(id) DO UPDATE SET grade = excluded.grade, letter = excluded.letter,                  shift = excluded.shift, class_type = excluded.class_type",
        )
        .bind(&effective)
        .bind(c.grade)
        .bind(&c.letter)
        .bind(c.headcount)
        .bind(&c.shift)
        .bind(&c.class_type)
        .execute(&mut *tx)
        .await?;
        class_id_map.insert(c.id.as_str(), effective);
        summary.classes += 1;
    }

    // Предметы: заводятся из нагрузки, если их ещё нет.
    let mut seen_subjects: HashSet<&str> = HashSet::new();
    for e in &p.curriculum {
        if !seen_subjects.insert(e.subject_id.as_str()) {
            continue;
        }
        let required = e.room_type.as_deref().filter(|rt| *rt != "General");
        sqlx::query(
            "INSERT INTO schedule_subjects (id, name, sanitary_weight, required_room_type, requires_split, is_double_allowed, related_subjects_json) \
             VALUES (?1, ?2, 5, ?3, 0, 0, '[]') \
             ON CONFLICT(id) DO UPDATE SET name = excluded.name",
        )
        .bind(&e.subject_id)
        .bind(&e.subject_name)
        .bind(required)
        .execute(&mut *tx)
        .await?;
        summary.subjects += 1;
    }

    // Нагрузка заменяется целиком.
    sqlx::query("DELETE FROM schedule_curriculum").execute(&mut *tx).await?;
    let known_teachers: HashSet<&str> = p.teachers.iter().map(|t| t.id.as_str()).collect();
    for e in &p.curriculum {
        // Класс берётся СОПОСТАВЛЕННЫМ: в книге он называется «4 ЛУО», в базе
        // это «4_do». Без отображения нагрузка ссылалась бы на строку,
        // которой нет, и импорт падал бы на внешнем ключе.
        let Some(class_id) = class_id_map.get(e.class_id.as_str()) else {
            summary.skipped += 1;
            continue;
        };
        if !known_teachers.contains(e.teacher_id.as_str()) {
            summary.skipped += 1;
            continue;
        }
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO schedule_curriculum (id, class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week, joint_lesson_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(class_id, subject_id) DO UPDATE SET \
                 teacher_id = excluded.teacher_id, hours_per_week = excluded.hours_per_week, \
                 joint_lesson_id = excluded.joint_lesson_id",
        )
        .bind(&id)
        .bind(class_id)
        .bind(&e.subject_id)
        .bind(&e.teacher_id)
        .bind(e.split_teacher2_id.as_deref().filter(|t| known_teachers.contains(*t)))
        .bind(e.hours_per_week)
        .bind(e.joint_lesson_id.as_deref())
        .execute(&mut *tx)
        .await?;
        summary.curriculum += 1;
    }

    // Полная замена: всё, чего нет в книге, удаляется. Расписания снимаются
    // первыми — иначе ON DELETE RESTRICT не даст убрать предметы и кабинеты.
    if mode == ImportMode::Replace {
        let keep_classes: Vec<String> = class_id_map.values().cloned().collect();
        let keep_teachers: Vec<String> = p.teachers.iter().map(|t| t.id.clone()).collect();
        let keep_rooms: Vec<String> = room_id_map.values().cloned().collect();
        let keep_subjects: Vec<String> =
            p.curriculum.iter().map(|e| e.subject_id.clone()).collect();

        sqlx::query("DELETE FROM schedule_slots").execute(&mut *tx).await?;
        sqlx::query("DELETE FROM schedule_fixed_slots").execute(&mut *tx).await?;

        summary.removed_classes = delete_missing(&mut tx, "schedule_classes", &keep_classes).await?;
        summary.removed_teachers = delete_missing(&mut tx, "schedule_teachers", &keep_teachers).await?;
        summary.removed_rooms = delete_missing(&mut tx, "schedule_rooms", &keep_rooms).await?;
        summary.removed_subjects = delete_missing(&mut tx, "schedule_subjects", &keep_subjects).await?;
    }

    tx.commit().await?;
    Ok(summary)
}

/// Удаляет из таблицы всё, чего нет в списке сохраняемых идентификаторов.
async fn delete_missing(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    keep: &[String],
) -> Result<usize, DbError> {
    if keep.is_empty() {
        // Пустой список означал бы «удалить всё» — почти наверняка ошибка
        // разбора, а не намерение пользователя.
        return Ok(0);
    }
    let placeholders = keep.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("DELETE FROM {table} WHERE id NOT IN ({placeholders})");
    let mut q = sqlx::query(&sql);
    for k in keep {
        q = q.bind(k);
    }
    Ok(q.execute(&mut **tx).await?.rows_affected() as usize)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImportSummary {
    pub rooms: usize,
    pub teachers: usize,
    pub classes: usize,
    pub subjects: usize,
    pub curriculum: usize,
    pub skipped: usize,
    /// Удалено при полной замене справочников.
    pub removed_classes: usize,
    pub removed_teachers: usize,
    pub removed_rooms: usize,
    pub removed_subjects: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_handles_cyrillic_and_punctuation() {
        assert_eq!(slugify("Ізбасты М.Ж."), "ізбасты_м_ж");
        assert_eq!(slugify("Русский язык"), "русский_язык");
        assert_eq!(slugify("  ---  "), "");
        // «ё» приводится к «е», иначе один учитель получит два идентификатора.
        assert_eq!(slugify("Королёва"), slugify("Королева"));
    }

    #[test]
    fn room_type_normalisation_covers_human_labels() {
        assert_eq!(normalize_room_type("Стандартный"), "General");
        assert_eq!(normalize_room_type("спортивный зал"), "Gym");
        assert_eq!(normalize_room_type("Информатика"), "Informatics");
        assert_eq!(normalize_room_type(""), "General");
        assert_eq!(normalize_room_type("нечто неведомое"), "General");
    }

    #[test]
    fn class_type_normalisation() {
        assert_eq!(normalize_class_type("Обычный"), "normal");
        assert_eq!(normalize_class_type("ЛУО"), "luo");
        assert_eq!(normalize_class_type("ДО (надомное)"), "do");
        assert_eq!(normalize_class_type("надомное обучение"), "do");
    }

    /// Классы и кабинеты сопоставляются по естественному ключу, а не по
    /// идентификатору из книги. В шаблоне класс называется «4 ЛУО», в базе —
    /// «4_luo»: вставка по id ломалась об уникальность (grade, letter,
    /// class_type), а нагрузка ссылалась на несуществующий класс и импорт
    /// падал на внешнем ключе.
    #[tokio::test]
    async fn matches_existing_class_by_natural_key() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::connect(&dir.path().join("t.db")).await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type) VALUES ('4_luo', 4, '', 25, 'First', 'luo')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO schedule_rooms (id, name, room_type, capacity) VALUES ('r_1', 'Кабинет 1', 'General', 30)")
            .execute(&pool).await.unwrap();

        let preview = ExcelImportPreview {
            rooms: vec![ParsedRoom {
                id: "sheet_room".into(), name: "Кабинет 1".into(),
                room_type: "General".into(), base_teacher_name: None,
            }],
            teachers: vec![ParsedTeacher {
                id: "ivanova".into(), full_name: "Иванова".into(),
                base_room_name: Some("Кабинет 1".into()), max_daily_lessons: 7,
                is_combined: false,
            }],
            classes: vec![ParsedClass {
                id: "4 ЛУО".into(), grade: 4, letter: String::new(),
                class_type: "luo".into(), shift: "First".into(), headcount: 1,
            }],
            curriculum: vec![ParsedCurriculum {
                class_id: "4 ЛУО".into(), subject_id: "hist".into(),
                subject_name: "История".into(), teacher_id: "ivanova".into(),
                teacher_name: "Иванова".into(), split_teacher2_id: None,
                hours_per_week: 2, joint_lesson_id: None, room_type: None,
            }],
            ..Default::default()
        };

        let summary = apply(&pool, &preview, ImportMode::Merge).await.expect("импорт должен пройти");
        assert_eq!(summary.curriculum, 1);
        assert_eq!(summary.skipped, 0);

        // Класс не продублирован: обновилась существующая строка.
        let classes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schedule_classes")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(classes, 1, "класс из книги не должен создавать дубликат");

        // Нагрузка ссылается на существующий класс.
        let cid: String = sqlx::query_scalar("SELECT class_id FROM schedule_curriculum")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(cid, "4_luo");

        // Кабинет сопоставлен по названию, дубликата нет.
        let rooms: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schedule_rooms")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(rooms, 1);
        let base: Option<String> = sqlx::query_scalar("SELECT base_room_id FROM schedule_teachers")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(base.as_deref(), Some("r_1"));
    }

    #[test]
    fn unknown_references_are_reported() {
        let mut p = ExcelImportPreview {
            teachers: vec![ParsedTeacher {
                id: "ivanova".into(), full_name: "Иванова".into(),
                base_room_name: Some("Кабинет 99".into()), max_daily_lessons: 7,
                is_combined: false,
            }],
            classes: vec![],
            curriculum: vec![ParsedCurriculum {
                class_id: "7a".into(), subject_id: "hist".into(),
                subject_name: "История".into(), teacher_id: "petrov".into(),
                teacher_name: "Петров".into(), split_teacher2_id: None,
                hours_per_week: 2, joint_lesson_id: None, room_type: None,
            }],
            ..Default::default()
        };
        check_references(&mut p);
        assert!(p.problems.iter().any(|s| s.contains("Петров")), "{:?}", p.problems);
        assert!(p.problems.iter().any(|s| s.contains("7a")), "{:?}", p.problems);
        assert!(p.warnings.iter().any(|s| s.contains("Кабинет 99")), "{:?}", p.warnings);
    }
}

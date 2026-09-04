//! Экспорт готового расписания в Excel и PDF.
//!
//! Три среза, каждый в двух видах — сводном и по одному субъекту:
//!   * всё расписание — сетка «класс × (день, урок)»;
//!   * по классам — общий свод и отдельный лист/страница на класс;
//!   * по учителям — то же для учителей.
//!
//! Данные берутся из базы и раскладываются в промежуточную структуру
//! `ReportData`, общую для обоих форматов: иначе Excel и PDF разошлись бы
//! в содержании, как это уже случалось с метриками расписания.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::DbError;
use crate::domain::schedule::time_grid::TimeGrid;

pub const DAY_NAMES: [&str; 7] = [
    "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье",
];
pub const DAY_SHORT: [&str; 7] = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/// Что именно выгружаем.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReportScope {
    /// Общая сетка: классы по столбцам, дни и уроки по строкам.
    All,
    /// Все классы, каждый отдельно.
    AllClasses,
    /// Один класс.
    Class { id: String },
    /// Все учителя, каждый отдельно.
    AllTeachers,
    /// Один учитель.
    Teacher { id: String },
}

impl ReportScope {
    /// Имя файла по умолчанию — без расширения.
    pub fn file_stem(&self, data: &ReportData) -> String {
        match self {
            Self::All => "Расписание".to_string(),
            Self::AllClasses => "Расписание по классам".to_string(),
            Self::AllTeachers => "Расписание по учителям".to_string(),
            Self::Class { id } => format!("Расписание {}", data.class_title(id)),
            Self::Teacher { id } => format!("Расписание {}", data.teacher_title(id)),
        }
    }
}

/// Один урок в отчёте — уже с человеческими названиями.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportLesson {
    pub class_id: String,
    pub class_title: String,
    pub subject: String,
    pub teacher: String,
    pub teacher_id: String,
    pub room: String,
    pub day: i64,
    pub period: i64,
    pub subgroup: Option<String>,
    pub is_joint: bool,
}

/// Всё, что нужно обоим форматам.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportData {
    pub school_name: String,
    pub variant_name: String,
    pub grid: TimeGrid,
    pub lessons: Vec<ReportLesson>,
    /// Классы в порядке вывода: параллель, затем литера.
    pub classes: Vec<(String, String)>,
    /// Учителя в алфавитном порядке.
    pub teachers: Vec<(String, String)>,
}

impl ReportData {
    pub fn class_title(&self, id: &str) -> String {
        self.classes
            .iter()
            .find(|(cid, _)| cid == id)
            .map(|(_, t)| t.clone())
            .unwrap_or_else(|| id.to_string())
    }

    pub fn teacher_title(&self, id: &str) -> String {
        self.teachers
            .iter()
            .find(|(tid, _)| tid == id)
            .map(|(_, t)| t.clone())
            .unwrap_or_else(|| id.to_string())
    }

    /// Уроки класса, разложенные по (день, урок).
    pub fn by_class(&self, class_id: &str) -> BTreeMap<(i64, i64), Vec<&ReportLesson>> {
        let mut m: BTreeMap<(i64, i64), Vec<&ReportLesson>> = BTreeMap::new();
        for l in self.lessons.iter().filter(|l| l.class_id == class_id) {
            m.entry((l.day, l.period)).or_default().push(l);
        }
        m
    }

    /// Уроки учителя, разложенные по (день, урок).
    /// Совмещённый урок остаётся одной записью на слот: учитель ведёт его
    /// один раз, а классы перечисляются в самой ячейке.
    pub fn by_teacher(&self, teacher_id: &str) -> BTreeMap<(i64, i64), Vec<&ReportLesson>> {
        let mut m: BTreeMap<(i64, i64), Vec<&ReportLesson>> = BTreeMap::new();
        for l in self.lessons.iter().filter(|l| l.teacher_id == teacher_id) {
            m.entry((l.day, l.period)).or_default().push(l);
        }
        m
    }

    /// Классы, у которых есть хотя бы один урок.
    pub fn non_empty_classes(&self) -> Vec<(String, String)> {
        self.classes
            .iter()
            .filter(|(id, _)| self.lessons.iter().any(|l| &l.class_id == id))
            .cloned()
            .collect()
    }

    /// Учителя, у которых есть хотя бы один урок.
    pub fn non_empty_teachers(&self) -> Vec<(String, String)> {
        self.teachers
            .iter()
            .filter(|(id, _)| self.lessons.iter().any(|l| &l.teacher_id == id))
            .cloned()
            .collect()
    }
}

/// Короткая запись урока для ячейки класса: предмет, учитель, кабинет.
pub fn cell_for_class(lessons: &[&ReportLesson]) -> String {
    lessons
        .iter()
        .map(|l| {
            let mut s = l.subject.clone();
            if let Some(g) = &l.subgroup {
                if !g.is_empty() {
                    s.push_str(&format!(" ({g})"));
                }
            }
            if !l.teacher.is_empty() {
                s.push_str(&format!("\n{}", short_name(&l.teacher)));
            }
            if !l.room.is_empty() {
                s.push_str(&format!("\n{}", l.room));
            }
            s
        })
        .collect::<Vec<_>>()
        .join("\n—\n")
}

/// Ячейка учителя: предмет и классы. Кабинет полезен, но вторичен.
pub fn cell_for_teacher(lessons: &[&ReportLesson]) -> String {
    if lessons.is_empty() {
        return String::new();
    }
    let subject = &lessons[0].subject;
    let classes: Vec<&str> = lessons.iter().map(|l| l.class_title.as_str()).collect();
    let room = &lessons[0].room;
    let mut s = format!("{subject}\n{}", classes.join(", "));
    if !room.is_empty() {
        s.push_str(&format!("\n{room}"));
    }
    s
}

/// «Иванова Мария Петровна» -> «Иванова М. П.»
pub fn short_name(full: &str) -> String {
    let parts: Vec<&str> = full.split_whitespace().collect();
    match parts.as_slice() {
        [] => String::new(),
        [one] => one.to_string(),
        [last, rest @ ..] => {
            let initials: String = rest
                .iter()
                .filter_map(|p| p.chars().next())
                .map(|c| format!("{}. ", c.to_uppercase()))
                .collect();
            format!("{last} {}", initials.trim_end())
        }
    }
}

/// Собирает данные отчёта из базы.
pub async fn load(pool: &SqlitePool, variant_id: &str) -> Result<ReportData, DbError> {
    let grid = TimeGrid::load(pool).await?;

    let school_name: Option<String> = sqlx::query_scalar("SELECT name FROM schools LIMIT 1")
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    let variant_name: Option<String> =
        sqlx::query_scalar("SELECT name FROM schedule_variants WHERE id = ?1")
            .bind(variant_id)
            .fetch_optional(pool)
            .await?;

    let classes_rows = sqlx::query_as::<_, (String, i64, String, String)>(
        "SELECT id, grade, COALESCE(letter, ''), COALESCE(class_type, 'normal') \
         FROM schedule_classes ORDER BY grade, letter",
    )
    .fetch_all(pool)
    .await?;
    let classes: Vec<(String, String)> = classes_rows
        .iter()
        .map(|(id, grade, letter, ctype)| {
            let mut title = if letter.is_empty() {
                grade.to_string()
            } else {
                format!("{grade}{letter}")
            };
            match ctype.as_str() {
                "luo" => title.push_str(" ЛУО"),
                "do" => title.push_str(" ДО"),
                _ => {}
            }
            (id.clone(), title)
        })
        .collect();
    let class_title: HashMap<&str, &str> = classes
        .iter()
        .map(|(id, t)| (id.as_str(), t.as_str()))
        .collect();

    let teachers: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT id, full_name FROM schedule_teachers ORDER BY full_name",
    )
    .fetch_all(pool)
    .await?;
    let teacher_name: HashMap<&str, &str> = teachers
        .iter()
        .map(|(id, n)| (id.as_str(), n.as_str()))
        .collect();

    let subject_name: HashMap<String, String> =
        sqlx::query_as::<_, (String, String)>("SELECT id, name FROM schedule_subjects")
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect();
    let room_name: HashMap<String, String> =
        sqlx::query_as::<_, (String, String)>("SELECT id, name FROM schedule_rooms")
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect();

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, i64, i64, String, Option<String>)>(
        "SELECT class_id, subject_id, teacher_id, room_id, day, period, \
                COALESCE(subgroup_label, ''), joint_lesson_id \
         FROM schedule_slots WHERE variant_id = ?1 ORDER BY day, period",
    )
    .bind(variant_id)
    .fetch_all(pool)
    .await?;

    let lessons = rows
        .into_iter()
        .map(|(class_id, subject_id, teacher_id, room_id, day, period, subgroup, joint)| {
            ReportLesson {
                class_title: class_title.get(class_id.as_str()).map(|s| s.to_string())
                    .unwrap_or_else(|| class_id.clone()),
                subject: subject_name.get(&subject_id).cloned().unwrap_or(subject_id),
                teacher: teacher_name.get(teacher_id.as_str()).map(|s| s.to_string())
                    .unwrap_or_else(|| teacher_id.clone()),
                room: room_id
                    .filter(|r| !r.trim().is_empty())
                    .and_then(|r| room_name.get(&r).cloned())
                    .unwrap_or_default(),
                class_id,
                teacher_id,
                day,
                period,
                subgroup: (!subgroup.is_empty()).then_some(subgroup),
                is_joint: joint.map(|j| !j.trim().is_empty()).unwrap_or(false),
            }
        })
        .collect();

    Ok(ReportData {
        school_name: school_name.unwrap_or_else(|| "Школа".to_string()),
        variant_name: variant_name.unwrap_or_else(|| "Расписание".to_string()),
        grid,
        lessons,
        classes,
        teachers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_name_makes_initials() {
        assert_eq!(short_name("Иванова Мария Петровна"), "Иванова М. П.");
        assert_eq!(short_name("Ким"), "Ким");
        assert_eq!(short_name(""), "");
        assert_eq!(short_name("Ли Ан"), "Ли А.");
    }

    fn lesson(class: &str, teacher: &str, subject: &str, room: &str) -> ReportLesson {
        ReportLesson {
            class_id: class.into(), class_title: class.into(),
            subject: subject.into(), teacher: teacher.into(),
            teacher_id: teacher.into(), room: room.into(),
            day: 0, period: 0, subgroup: None, is_joint: false,
        }
    }

    #[test]
    fn class_cell_lists_subject_teacher_and_room() {
        let l = lesson("7а", "Иванова Мария", "Алгебра", "Каб. 12");
        let text = cell_for_class(&[&l]);
        assert!(text.contains("Алгебра"));
        assert!(text.contains("Иванова М."), "{text}");
        assert!(text.contains("Каб. 12"));
    }

    #[test]
    fn teacher_cell_merges_joint_classes() {
        // Совмещённый урок: два класса в одном слоте — одна ячейка.
        let a = lesson("7б", "Бабич", "Математика", "Каб. 3");
        let b = lesson("7б ЛУО", "Бабич", "Математика", "Каб. 3");
        let text = cell_for_teacher(&[&a, &b]);
        assert!(text.contains("Математика"));
        assert!(text.contains("7б, 7б ЛУО"), "{text}");
    }

    #[test]
    fn class_cell_shows_subgroup() {
        let mut l = lesson("7а", "Смит", "Английский", "Каб. 5");
        l.subgroup = Some("1гр".into());
        assert!(cell_for_class(&[&l]).contains("(1гр)"));
    }
}

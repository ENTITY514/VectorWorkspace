//! Домен идентичности: школа, штат, профиль учителя, физические классы.
//! Бюрократия изолирована от педагогики (doc 12 §IX): школа — преходящая
//! административная оболочка, контуры в БД существуют параллельно.
//! Temporal Integrity: должности активны с `valid_from` по `valid_to`,
//! смена директора не переписывает старые подписи — ревизия фиксируется.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

use crate::domain::ids::{ClassId, SchoolId, StaffId, TeacherProfileId};

/// Роль в штате школы. Строгий enum, расширение — отдельный PR.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StaffRole {
    Director,
    DeputyDirector,
    MethodHead,
    Teacher,
}

impl StaffRole {
    /// Канонические значения, хранящиеся в БД (`school_staff.role`).
    pub const ALL: [StaffRole; 4] = [
        StaffRole::Director,
        StaffRole::DeputyDirector,
        StaffRole::MethodHead,
        StaffRole::Teacher,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            StaffRole::Director => "Director",
            StaffRole::DeputyDirector => "DeputyDirector",
            StaffRole::MethodHead => "MethodHead",
            StaffRole::Teacher => "Teacher",
        }
    }

    /// Русская подпись для UI.
    pub fn label(self) -> &'static str {
        match self {
            StaffRole::Director => "Директор",
            StaffRole::DeputyDirector => "Завуч",
            StaffRole::MethodHead => "Председатель МО",
            StaffRole::Teacher => "Учитель",
        }
    }
}

impl FromStr for StaffRole {
    type Err = IdentityError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim() {
            "Director" | "director" => Ok(StaffRole::Director),
            "DeputyDirector" | "deputy_director" | "завуч" => Ok(StaffRole::DeputyDirector),
            "MethodHead" | "method_head" | "председатель МО" => Ok(StaffRole::MethodHead),
            "Teacher" | "teacher" => Ok(StaffRole::Teacher),
            other => Err(IdentityError::UnknownRole(other.to_string())),
        }
    }
}

impl fmt::Display for StaffRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Язык обучения физического класса.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Language {
    Ru,
    Kk,
}

impl Language {
    pub fn as_str(self) -> &'static str {
        match self {
            Language::Ru => "RU",
            Language::Kk => "KK",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Language::Ru => "Русский",
            Language::Kk => "Қазақ",
        }
    }
}

impl FromStr for Language {
    type Err = IdentityError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_uppercase().as_str() {
            "RU" => Ok(Language::Ru),
            "KK" | "KZ" => Ok(Language::Kk),
            other => Err(IdentityError::UnknownLanguage(other.to_string())),
        }
    }
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Школа — административная оболочка учреждения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct School {
    pub id: SchoolId,
    pub name: String,
    pub region: Option<String>,
    pub created_at: String,
}

impl School {
    pub fn new(name: String, region: Option<String>) -> Result<Self, IdentityError> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(IdentityError::EmptyName("Школа"));
        }
        Ok(Self {
            id: SchoolId::new(),
            name,
            region: region.map(|r| r.trim().to_string()).filter(|r| !r.is_empty()),
            created_at: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        })
    }
}

/// Должность в штате школы. `is_active` + период — механизм temporal integrity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchoolStaff {
    pub id: StaffId,
    pub school_id: SchoolId,
    pub role: StaffRole,
    pub full_name: String,
    pub is_active: bool,
    pub valid_from: Option<NaiveDate>,
    pub valid_to: Option<NaiveDate>,
}

impl SchoolStaff {
    pub fn new(
        school_id: SchoolId,
        role: StaffRole,
        full_name: String,
        valid_from: Option<NaiveDate>,
    ) -> Result<Self, IdentityError> {
        let full_name = full_name.trim().to_string();
        if full_name.is_empty() {
            return Err(IdentityError::EmptyName("Сотрудник"));
        }
        Ok(Self {
            id: StaffId::new(),
            school_id,
            role,
            full_name,
            is_active: true,
            valid_from: valid_from.or_else(|| Some(chrono::Local::now().date_naive())),
            valid_to: None,
        })
    }
}

/// Профиль учителя. Single-user: один профиль на рабочую станцию.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TeacherProfile {
    pub id: TeacherProfileId,
    pub school_id: SchoolId,
    pub full_name: String,
    pub category: Option<String>,
}

impl TeacherProfile {
    pub fn new(
        school_id: SchoolId,
        full_name: String,
        category: Option<String>,
    ) -> Result<Self, IdentityError> {
        let full_name = full_name.trim().to_string();
        if full_name.is_empty() {
            return Err(IdentityError::EmptyName("Профиль учителя"));
        }
        Ok(Self {
            id: TeacherProfileId::new(),
            school_id,
            full_name,
            category: category.map(|c| c.trim().to_string()).filter(|c| !c.is_empty()),
        })
    }
}

/// Физический класс («7 А», «8 Б»). Не дублирует абстрактные параллели ТУП.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClassGroup {
    pub id: ClassId,
    pub school_id: SchoolId,
    pub grade: u8,
    pub letter: String,
    pub language: Language,
}

impl ClassGroup {
    pub fn new(
        school_id: SchoolId,
        grade: u8,
        letter: String,
        language: Language,
    ) -> Result<Self, IdentityError> {
        if !(1..=12).contains(&grade) {
            return Err(IdentityError::GradeOutOfRange(grade));
        }
        let letter = letter.trim().to_uppercase();
        if letter.is_empty() {
            return Err(IdentityError::EmptyLetter);
        }
        Ok(Self {
            id: ClassId::new(),
            school_id,
            grade,
            letter,
            language,
        })
    }
}

/// Агрегат состояния учреждения для онбординга и экрана настроек.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchoolState {
    pub school: Option<School>,
    pub staff: Vec<SchoolStaff>,
    pub profile: Option<TeacherProfile>,
    pub classes: Vec<ClassGroup>,
}

impl SchoolState {
    pub fn is_onboarded(&self) -> bool {
        self.school.is_some()
    }
}

/// Ошибки домена идентичности.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IdentityError {
    #[error("{0}: имя не может быть пустым")]
    EmptyName(&'static str),
    #[error("Класс {0}: допустимы уровни 1–12")]
    GradeOutOfRange(u8),
    #[error("Буква класса не может быть пустой")]
    EmptyLetter,
    #[error("Неизвестный язык обучения: {0}")]
    UnknownLanguage(String),
    #[error("Неизвестная роль в штате: {0}")]
    UnknownRole(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sid() -> SchoolId {
        SchoolId::new()
    }

    #[test]
    fn school_requires_non_empty_name() {
        assert_eq!(School::new("   ".into(), None), Err(IdentityError::EmptyName("Школа")));
        assert!(School::new("СШ №1".into(), Some("Костанай".into())).is_ok());
    }

    #[test]
    fn grade_range_1_12_enforced() {
        assert_eq!(
            ClassGroup::new(sid(), 0, "А".into(), Language::Ru),
            Err(IdentityError::GradeOutOfRange(0))
        );
        assert_eq!(
            ClassGroup::new(sid(), 13, "А".into(), Language::Ru),
            Err(IdentityError::GradeOutOfRange(13))
        );
        assert!(ClassGroup::new(sid(), 12, "Б".into(), Language::Kk).is_ok());
    }

    #[test]
    fn class_letter_normalized_and_required() {
        assert_eq!(ClassGroup::new(sid(), 7, "  ".into(), Language::Ru), Err(IdentityError::EmptyLetter));
        let c = ClassGroup::new(sid(), 7, " а ".into(), Language::Ru).unwrap();
        assert_eq!(c.letter, "А");
        assert_eq!(c.grade, 7);
    }

    #[test]
    fn language_parses_ru_kk_only() {
        assert_eq!("RU".parse::<Language>(), Ok(Language::Ru));
        assert_eq!("kk".parse::<Language>(), Ok(Language::Kk));
        assert_eq!(Language::from_str("XX"), Err(IdentityError::UnknownLanguage("XX".into())));
        assert_eq!(Language::Ru.as_str(), "RU");
        assert_eq!(Language::Kk.as_str(), "KK");
    }

    #[test]
    fn staff_role_parses_tokens() {
        assert_eq!("Director".parse::<StaffRole>(), Ok(StaffRole::Director));
        assert_eq!("завуч".parse::<StaffRole>(), Ok(StaffRole::DeputyDirector));
        assert_eq!(StaffRole::MethodHead.as_str(), "MethodHead");
        assert_eq!(StaffRole::Teacher.label(), "Учитель");
        assert_eq!(StaffRole::from_str("Unknown"), Err(IdentityError::UnknownRole("Unknown".into())));
    }

    #[test]
    fn staff_defaults_valid_from_and_active() {
        let s = SchoolStaff::new(sid(), StaffRole::Director, " Иванов ".into(), None).unwrap();
        assert_eq!(s.full_name, "Иванов");
        assert!(s.is_active);
        assert!(s.valid_from.is_some());
        assert_eq!(s.valid_to, None);
    }

    #[test]
    fn profile_requires_full_name() {
        assert_eq!(
            TeacherProfile::new(sid(), "  ".into(), None),
            Err(IdentityError::EmptyName("Профиль учителя"))
        );
        assert!(TeacherProfile::new(sid(), "Иванова".into(), Some("модератор".into())).is_ok());
    }

    #[test]
    fn school_state_onboarded_flag() {
        assert!(!SchoolState { school: None, staff: vec![], profile: None, classes: vec![] }.is_onboarded());
        assert!(SchoolState {
            school: School::new("СШ".into(), None).ok(),
            staff: vec![],
            profile: None,
            classes: vec![],
        }
        .is_onboarded());
    }
}
//! Домен КТП (календарно-тематическое планирование).
//! Чистая логика: план → четверти → уроки. Дата-движок в `rk_calendar`,
//! инварианты оценивания в `invariants`, БД — в репозитории.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::domain::ids::{KtpLessonId, KtpPlanId, KtpQuarterId};
use crate::domain::invariants::LessonKind;

/// Статус плана (конечный автомат FR-2.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum KtpStatus {
    Draft,
    Validating,
    Approved,
    Archived,
}

impl KtpStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            KtpStatus::Draft => "Draft",
            KtpStatus::Validating => "Validating",
            KtpStatus::Approved => "Approved",
            KtpStatus::Archived => "Archived",
        }
    }
}

/// Цель обучения урока: код + текст описания.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonObjective {
    /// Код цели обучения (например "7.1.1.4").
    pub code: String,
    /// Текст цели (то, что видит учитель в редакторе).
    pub description: String,
}

/// План КТП для одного предмета и класса.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpPlan {
    pub id: KtpPlanId,
    pub subject_id: String,
    pub grade: i64,
    /// Язык документа ТУП, из которого сгенерирован план (RU/KK).
    pub language: String,
    /// "2026-2027".
    pub academic_year: String,
    pub total_hours: i64,
    pub status: KtpStatus,
    pub created_at: String,
    pub updated_at: String,
    /// CSV ISO-номеров дней недели расписания (1=Пн … 7=Вс).
    pub days_of_week: String,
    pub quarters: Vec<KtpQuarter>,
}

/// Четверть плана.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpQuarter {
    pub id: KtpQuarterId,
    pub ktp_id: KtpPlanId,
    pub quarter_number: i64,
    pub hours_per_week: i64,
    pub lessons: Vec<KtpLesson>,
}

/// Урок КТП.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpLesson {
    pub id: KtpLessonId,
    pub quarter_id: KtpQuarterId,
    /// Логический индекс урока 1..N по всему году (FR-2.4 эталон).
    pub global_index: i64,
    /// Индекс внутри четверти.
    pub quarter_index: i64,
    pub topic_title: String,
    /// Раздел долгосрочного плана (для стандартных уроков — из ТУП).
    pub section_name: String,
    pub lesson_type: LessonKind,
    /// Физическая дата (производственный календарь РК).
    pub planned_date: Option<NaiveDate>,
    pub is_cancelled: bool,
    /// Цели обучения урока: код + описание (то, что видит учитель).
    pub objectives: Vec<LessonObjective>,
}

impl KtpLesson {
    pub fn new(
        quarter_id: KtpQuarterId,
        global_index: i64,
        quarter_index: i64,
        topic_title: String,
        lesson_type: LessonKind,
    ) -> Self {
        Self {
            id: KtpLessonId::new(),
            quarter_id,
            global_index,
            quarter_index,
            topic_title,
            section_name: String::new(),
            lesson_type,
            planned_date: None,
            is_cancelled: false,
            objectives: Vec::new(),
        }
    }

    /// Список кодов целей урока.
    pub fn objective_codes(&self) -> impl Iterator<Item = &str> {
        self.objectives.iter().map(|o| o.code.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_roundtrip_strings() {
        assert_eq!(KtpStatus::Draft.as_str(), "Draft");
        assert_eq!(KtpStatus::Approved.as_str(), "Approved");
        assert_eq!(LessonKind::Soch.as_str(), "Soch");
        assert_eq!(LessonKind::Sor.as_str(), "Sor");
    }

    #[test]
    fn lesson_carries_type_and_indexes() {
        let q = KtpQuarterId::new();
        let l = KtpLesson::new(q, 7, 3, "Тема".into(), LessonKind::Standard);
        assert_eq!(l.global_index, 7);
        assert_eq!(l.quarter_index, 3);
        assert_eq!(l.lesson_type, LessonKind::Standard);
        assert!(l.planned_date.is_none());
    }
}
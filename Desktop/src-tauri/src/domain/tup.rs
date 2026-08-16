//! Домен нормативного базиса (ТУП).
//! Алгебра и геометрия — разные документы (`subject_id` × `target_grades`).
//! ТУП — неизменные законы педагогики; школа сюда не примешивается.

use serde::{Deserialize, Serialize};

use crate::domain::ids::{
    ObjectiveId, TupDocumentId, TupHourId, TupQuarterId, TupSectionId, TupTaskId, TupTopicId,
};

/// Направление обучения для документов 10–11 классов.
/// ЕМН и ОГН — разные документы с разными целями (приложение 104 vs 105).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TupDirection {
    /// Общая программа (7–9 классы — направления нет).
    Common,
    /// Естественно-математическое направление.
    Emn,
    /// Общественно-гуманитарное направление.
    Ogn,
}

/// Документ ТУП (одна типовая учебная программа).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TupDocument {
    pub id: TupDocumentId,
    /// Номер приказа МОН РК (например "399").
    pub order_number: String,
    /// Дата приказа (ISO-8601, например "2022-09-16").
    pub order_date: String,
    /// Номер приложения к приказу.
    pub appendix_number: i64,
    /// Стабильный идентификатор предмета (slug): "algebra", "geometry", ...
    pub subject_id: String,
    /// Язык документа: "RU" | "KK" | ...
    pub language: String,
    /// Диапазон классов: "7-9" | "10-11".
    pub target_grades: String,
    /// Направление обучения (ЕМН/ОГН для 10–11, иначе Common).
    pub direction: TupDirection,
    /// Правовая основа (Глава 1, п. 1).
    pub legal_basis: String,
    /// Цель предмета (Глава 1, п. «Цель/Цель обучения»).
    pub goal_text: String,
}

impl TupDocument {
    pub fn new(
        order_number: String,
        order_date: String,
        appendix_number: i64,
        subject_id: String,
        language: String,
        target_grades: String,
        direction: TupDirection,
    ) -> Self {
        Self {
            id: TupDocumentId::new(),
            order_number,
            order_date,
            appendix_number,
            subject_id,
            language,
            target_grades,
            direction,
            legal_basis: String::new(),
            goal_text: String::new(),
        }
    }
}

/// Цель обучения в документе ТУП.
/// `code` — точная строка из ТУП (4-частная `8.4.2.1` или 3-частная `10.1.1`
/// для геометрии 10-11), хранится как есть (ADR: парсер — абсолютный фильтр).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningObjective {
    pub id: ObjectiveId,
    pub document_id: TupDocumentId,
    pub grade: i64,
    pub section_number: i64,
    pub subsection_number: i64,
    pub objective_number: i64,
    pub description: String,
    pub code: String,
}

impl LearningObjective {
    pub fn new(
        document_id: TupDocumentId,
        grade: i64,
        section_number: i64,
        subsection_number: i64,
        objective_number: i64,
        description: String,
        code: String,
    ) -> Self {
        Self {
            id: ObjectiveId::new(),
            document_id,
            grade,
            section_number,
            subsection_number,
            objective_number,
            code,
            description,
        }
    }
}

/// Задача предмета (Глава 1, п. 3 «Задачи:»). Воспитательный и академический
/// фундамент — интегрируется в титульные листы КСП.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TupTask {
    pub id: TupTaskId,
    pub document_id: TupDocumentId,
    pub order_index: i64,
    pub task_text: String,
}

impl TupTask {
    pub fn new(document_id: TupDocumentId, order_index: i64, task_text: String) -> Self {
        Self {
            id: TupTaskId::new(),
            document_id,
            order_index,
            task_text,
        }
    }
}

/// Учебная нагрузка по классу (Глава 2, Параграф 1, п. «Максимальный объем…»).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TupSubjectHours {
    pub id: TupHourId,
    pub document_id: TupDocumentId,
    pub grade: i64,
    pub hours_per_week: f64,
    pub hours_per_year: i64,
}

impl TupSubjectHours {
    pub fn new(
        document_id: TupDocumentId,
        grade: i64,
        hours_per_week: f64,
        hours_per_year: i64,
    ) -> Self {
        Self {
            id: TupHourId::new(),
            document_id,
            grade,
            hours_per_week,
            hours_per_year,
        }
    }
}

/// Четверть Долгосрочного плана (Параграф 3).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TupQuarter {
    pub id: TupQuarterId,
    pub document_id: TupDocumentId,
    pub grade: i64,
    /// 1..4.
    pub quarter_number: i64,
    pub sections: Vec<TupSection>,
}

impl TupQuarter {
    pub fn new(document_id: TupDocumentId, grade: i64, quarter_number: i64) -> Self {
        Self {
            id: TupQuarterId::new(),
            document_id,
            grade,
            quarter_number,
            sections: Vec::new(),
        }
    }

    pub fn with_sections(mut self, sections: Vec<TupSection>) -> Self {
        self.sections = sections;
        self
    }
}

/// Раздел Долгосрочного плана (Параграф 3).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TupSection {
    pub id: TupSectionId,
    pub quarter_id: TupQuarterId,
    pub name: String,
    pub order_index: i64,
    pub topics: Vec<TupTopic>,
}

impl TupSection {
    pub fn new(quarter_id: TupQuarterId, name: String, order_index: i64) -> Self {
        Self {
            id: TupSectionId::new(),
            quarter_id,
            name,
            order_index,
            topics: Vec::new(),
        }
    }

    pub fn with_topics(mut self, topics: Vec<TupTopic>) -> Self {
        self.topics = topics;
        self
    }
}

/// Тема Долгосрочного плана (Параграф 3).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TupTopic {
    pub id: TupTopicId,
    pub section_id: TupSectionId,
    pub name: String,
    pub order_index: i64,
    /// Коды целей обучения, изучаемые в этой теме (как в источнике).
    pub objective_codes: Vec<String>,
}

impl TupTopic {
    pub fn new(
        section_id: TupSectionId,
        name: String,
        order_index: i64,
        objective_codes: Vec<String>,
    ) -> Self {
        Self {
            id: TupTopicId::new(),
            section_id,
            name,
            order_index,
            objective_codes,
        }
    }
}

/// Агрегат полного документа ТУП: всё, что извлекается из HTML.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullTupDocument {
    pub document: TupDocument,
    pub tasks: Vec<TupTask>,
    pub hours: Vec<TupSubjectHours>,
    pub objectives: Vec<LearningObjective>,
    pub quarters: Vec<TupQuarter>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn objective_code_is_stored_as_is() {
        let doc = TupDocument::new(
            "399".into(),
            "2022-09-16".into(),
            53,
            "algebra".into(),
            "RU".into(),
            "7-9".into(),
            TupDirection::Common,
        );
        // 4-частный код алгебры.
        let obj = LearningObjective::new(doc.id, 7, 2, 1, 4, "применять свойства".into(), "7.2.1.4".into());
        assert_eq!(obj.code, "7.2.1.4");
        // 3-частный код геометрии 10-11 хранится без приписывания подраздела.
        let geo = LearningObjective::new(doc.id, 10, 1, 1, 1, "знать определение".into(), "10.1.1".into());
        assert_eq!(geo.code, "10.1.1");
    }

    #[test]
    fn document_carries_subject_and_grades() {
        let doc = TupDocument::new(
            "399".into(),
            "2022-09-16".into(),
            54,
            "geometry".into(),
            "RU".into(),
            "7-9".into(),
            TupDirection::Common,
        );
        assert_eq!(doc.subject_id, "geometry");
        assert_eq!(doc.target_grades, "7-9");
        assert_eq!(doc.direction, TupDirection::Common);
    }

    #[test]
    fn emn_and_ogn_are_distinct_documents() {
        let emn = TupDocument::new(
            "399".into(),
            "2022-09-16".into(),
            104,
            "algebra_analysis".into(),
            "RU".into(),
            "10-11".into(),
            TupDirection::Emn,
        );
        let ogn = TupDocument::new(
            "399".into(),
            "2022-09-16".into(),
            105,
            "algebra_analysis".into(),
            "RU".into(),
            "10-11".into(),
            TupDirection::Ogn,
        );
        assert_ne!(emn.direction, ogn.direction);
        assert_ne!(emn.id, ogn.id);
    }
}

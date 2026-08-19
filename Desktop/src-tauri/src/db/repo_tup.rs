//! Репозиторий нормативного базиса (ТУП): документы и цели обучения.
//! Исполняет волю домена над `tup_documents` / `learning_objectives`.

use std::str::FromStr;

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::ids::{
    ObjectiveId, TupDocumentId, TupHourId, TupQuarterId, TupSectionId, TupTaskId, TupTopicId,
};
use crate::domain::tup::{
    FullTupDocument, LearningObjective, TupDocument, TupDirection, TupQuarter, TupSection,
    TupSubjectHours, TupTask, TupTopic,
};
use crate::db::DbError;

/// Сохраняет документ ТУП и все его цели обучения единой транзакцией.
pub async fn save_document(
    pool: &SqlitePool,
    doc: &TupDocument,
    objectives: &[LearningObjective],
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO tup_documents
            (id, order_number, order_date, appendix_number, subject_id, language, target_grades, direction, legal_basis, goal_text)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )
    .bind(doc.id.to_string())
    .bind(&doc.order_number)
    .bind(&doc.order_date)
    .bind(doc.appendix_number)
    .bind(&doc.subject_id)
    .bind(&doc.language)
    .bind(&doc.target_grades)
    .bind(direction_to_sql(doc.direction))
    .bind(&doc.legal_basis)
    .bind(&doc.goal_text)
    .execute(&mut *tx)
    .await?;

    for obj in objectives {
        sqlx::query(
            "INSERT INTO learning_objectives
                (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(obj.id.to_string())
        .bind(obj.document_id.to_string())
        .bind(obj.grade)
        .bind(obj.section_number)
        .bind(obj.subsection_number)
        .bind(obj.objective_number)
        .bind(&obj.description)
        .bind(&obj.code)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// Сохраняет полный документ ТУП: документ, задачи, нагрузку, цели и Долгосрочный план.
pub async fn save_full_document(
    pool: &SqlitePool,
    full: &FullTupDocument,
) -> Result<(), DbError> {
    save_document(pool, &full.document, &full.objectives).await?;

    let mut tx = pool.begin().await?;
    let doc_id = full.document.id.to_string();

    for task in &full.tasks {
        sqlx::query(
            "INSERT INTO tup_document_tasks (id, document_id, order_index, task_text)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(task.id.to_string())
        .bind(&doc_id)
        .bind(task.order_index)
        .bind(&task.task_text)
        .execute(&mut *tx)
        .await?;
    }

    for h in &full.hours {
        sqlx::query(
            "INSERT INTO tup_subject_hours (id, document_id, grade, hours_per_week, hours_per_year)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(h.id.to_string())
        .bind(&doc_id)
        .bind(h.grade)
        .bind(h.hours_per_week)
        .bind(h.hours_per_year)
        .execute(&mut *tx)
        .await?;
    }

    for q in &full.quarters {
        sqlx::query(
            "INSERT INTO tup_quarters (id, document_id, grade, quarter_number)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(q.id.to_string())
        .bind(&doc_id)
        .bind(q.grade)
        .bind(q.quarter_number)
        .execute(&mut *tx)
        .await?;

        for (si, section) in q.sections.iter().enumerate() {
            sqlx::query(
                "INSERT INTO tup_sections (id, quarter_id, name, order_index)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(section.id.to_string())
            .bind(q.id.to_string())
            .bind(&section.name)
            .bind(si as i64)
            .execute(&mut *tx)
            .await?;

            for (ti, topic) in section.topics.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO tup_topics (id, section_id, name, order_index)
                     VALUES (?1, ?2, ?3, ?4)",
                )
                .bind(topic.id.to_string())
                .bind(section.id.to_string())
                .bind(&topic.name)
                .bind(ti as i64)
                .execute(&mut *tx)
                .await?;

                for code in &topic.objective_codes {
                    sqlx::query(
                        "INSERT INTO tup_topic_objectives (topic_id, objective_code)
                         VALUES (?1, ?2)",
                    )
                    .bind(topic.id.to_string())
                    .bind(code)
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }
    }

    tx.commit().await?;
    Ok(())
}

/// Документ ТУП с признаком наличия целей.
#[derive(Debug, sqlx::FromRow)]
pub struct TupDocumentRow {
    pub id: String,
    pub order_number: String,
    pub order_date: String,
    pub appendix_number: i64,
    pub subject_id: String,
    pub language: String,
    pub target_grades: String,
    pub direction: String,
    pub objective_count: i64,
}

/// Все документы ТУП с количеством целей.
pub async fn list_documents(pool: &SqlitePool) -> Result<Vec<TupDocumentRow>, DbError> {
    let rows = sqlx::query_as::<_, TupDocumentRow>(
        "SELECT d.*,
                (SELECT COUNT(*) FROM learning_objectives o WHERE o.document_id = d.id) AS objective_count
         FROM tup_documents d
         ORDER BY d.subject_id, d.target_grades, d.direction",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Цели обучения документа для указанного класса (или всех классов, если grade = None).
pub async fn list_objectives(
    pool: &SqlitePool,
    document_id: TupDocumentId,
    grade: Option<i64>,
) -> Result<Vec<LearningObjective>, DbError> {
    let rows = match grade {
        Some(g) => {
            sqlx::query_as::<_, ObjectiveRow>(
                "SELECT id, document_id, grade, section_number, subsection_number, objective_number, description, code
                 FROM learning_objectives
                 WHERE document_id = ?1 AND grade = ?2
                 ORDER BY section_number, subsection_number, objective_number",
            )
            .bind(document_id.to_string())
            .bind(g)
            .fetch_all(pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, ObjectiveRow>(
                "SELECT id, document_id, grade, section_number, subsection_number, objective_number, description, code
                 FROM learning_objectives
                 WHERE document_id = ?1
                 ORDER BY grade, section_number, subsection_number, objective_number",
            )
            .bind(document_id.to_string())
            .fetch_all(pool)
            .await?
        }
    };

    Ok(rows.into_iter().map(|r| r.to_domain()).collect())
}

/// Полный документ ТУП: документ, задачи, нагрузка, цели, Долгосрочный план.
pub async fn get_full_document(
    pool: &SqlitePool,
    document_id: TupDocumentId,
) -> Result<Option<FullTupDocument>, DbError> {
    let doc_row: Option<(String, String, String, i64, String, String, String, String, String, String)> =
        sqlx::query_as(
            "SELECT id, order_number, order_date, appendix_number, subject_id, language,
                    target_grades, direction, legal_basis, goal_text
             FROM tup_documents WHERE id = ?1",
        )
        .bind(document_id.to_string())
        .fetch_optional(pool)
        .await?;

    let Some(doc_row) = doc_row else {
        return Ok(None);
    };

    let direction = direction_from_sql(&doc_row.7);
    let doc = TupDocument {
        id: document_id,
        order_number: doc_row.1,
        order_date: doc_row.2,
        appendix_number: doc_row.3,
        subject_id: doc_row.4,
        language: doc_row.5,
        target_grades: doc_row.6,
        direction,
        legal_basis: doc_row.8,
        goal_text: doc_row.9,
    };

    let tasks = sqlx::query_as::<_, TaskRow>(
        "SELECT id, document_id, order_index, task_text FROM tup_document_tasks
         WHERE document_id = ?1 ORDER BY order_index",
    )
    .bind(document_id.to_string())
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| TupTask {
        id: TupTaskId::from(Uuid::from_str(&r.id).unwrap_or_default()),
        document_id,
        order_index: r.order_index,
        task_text: r.task_text,
    })
    .collect();

    let hours = sqlx::query_as::<_, HourRow>(
        "SELECT id, document_id, grade, hours_per_week, hours_per_year FROM tup_subject_hours
         WHERE document_id = ?1 ORDER BY grade",
    )
    .bind(document_id.to_string())
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| TupSubjectHours {
        id: TupHourId::from(Uuid::from_str(&r.id).unwrap_or_default()),
        document_id,
        grade: r.grade,
        hours_per_week: r.hours_per_week,
        hours_per_year: r.hours_per_year,
    })
    .collect();

    let objectives = list_objectives(pool, document_id, None).await?;

    let quarters = sqlx::query_as::<_, QuarterRow>(
        "SELECT id, document_id, grade, quarter_number FROM tup_quarters
         WHERE document_id = ?1 ORDER BY grade, quarter_number",
    )
    .bind(document_id.to_string())
    .fetch_all(pool)
    .await?;

    let mut result_quarters = Vec::new();
    for q in quarters {
        let quarter_id = TupQuarterId::from(Uuid::from_str(&q.id).unwrap_or_default());
        let sections = sqlx::query_as::<_, SectionRow>(
            "SELECT id, quarter_id, name, order_index FROM tup_sections
             WHERE quarter_id = ?1 ORDER BY order_index",
        )
        .bind(q.id.clone())
        .fetch_all(pool)
        .await?;

        let mut result_sections = Vec::new();
        for s in sections {
            let section_id = TupSectionId::from(Uuid::from_str(&s.id).unwrap_or_default());
            let topics = sqlx::query_as::<_, TopicRow>(
                "SELECT id, section_id, name, order_index FROM tup_topics
                 WHERE section_id = ?1 ORDER BY order_index",
            )
            .bind(s.id.clone())
            .fetch_all(pool)
            .await?;

            let mut result_topics = Vec::new();
            for t in topics {
                let topic_id = TupTopicId::from(Uuid::from_str(&t.id).unwrap_or_default());
                let codes: Vec<String> =
                    sqlx::query_scalar("SELECT objective_code FROM tup_topic_objectives WHERE topic_id = ?1 ORDER BY objective_code")
                        .bind(t.id.clone())
                        .fetch_all(pool)
                        .await?;
                result_topics.push(TupTopic {
                    id: topic_id,
                    section_id,
                    name: t.name,
                    order_index: t.order_index,
                    objective_codes: codes,
                });
            }
            result_sections.push(TupSection {
                id: section_id,
                quarter_id,
                name: s.name,
                order_index: s.order_index,
                topics: result_topics,
            });
        }
        result_quarters.push(TupQuarter {
            id: quarter_id,
            document_id,
            grade: q.grade,
            quarter_number: q.quarter_number,
            sections: result_sections,
        });
    }

    Ok(Some(FullTupDocument {
        document: doc,
        tasks,
        hours,
        objectives,
        quarters: result_quarters,
    }))
}

/// Заготовка для дедупликации: признаки существующего документа.
/// Ключ включает язык и номер приложения — один предмет (subject_id ×
/// target_grades × direction) может иметь несколько документов для разных
/// языков обучения (например «Обучение грамоте» для русского/уйгурского/
/// узбекского/таджикского), которые различаются только appendix_number.
/// Без языка русская и казахская версии одного документа считались бы
/// одинаковыми и одна из них пропускалась бы.
pub async fn find_existing(
    pool: &SqlitePool,
    subject_id: &str,
    target_grades: &str,
    direction: TupDirection,
    appendix_number: i64,
    language: &str,
) -> Result<Option<TupDocumentId>, DbError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM tup_documents
         WHERE subject_id = ?1 AND target_grades = ?2 AND direction = ?3 AND appendix_number = ?4 AND language = ?5
         LIMIT 1",
    )
    .bind(subject_id)
    .bind(target_grades)
    .bind(direction_to_sql(direction))
    .bind(appendix_number)
    .bind(language)
    .fetch_optional(pool)
    .await?;

    Ok(row.and_then(|r| TupDocumentId::from_str(&r.0).ok()))
}

fn direction_to_sql(d: TupDirection) -> &'static str {
    match d {
        TupDirection::Common => "common",
        TupDirection::Emn => "emn",
        TupDirection::Ogn => "ogn",
    }
}

fn direction_from_sql(s: &str) -> TupDirection {
    match s {
        "emn" => TupDirection::Emn,
        "ogn" => TupDirection::Ogn,
        _ => TupDirection::Common,
    }
}

#[derive(sqlx::FromRow)]
struct ObjectiveRow {
    id: String,
    document_id: String,
    grade: i64,
    section_number: i64,
    subsection_number: i64,
    objective_number: i64,
    description: String,
    code: String,
}

impl ObjectiveRow {
    fn to_domain(self) -> LearningObjective {
        LearningObjective {
            id: ObjectiveId::from(Uuid::from_str(&self.id).unwrap_or_default()),
            document_id: TupDocumentId::from(Uuid::from_str(&self.document_id).unwrap_or_default()),
            grade: self.grade,
            section_number: self.section_number,
            subsection_number: self.subsection_number,
            objective_number: self.objective_number,
            description: self.description,
            code: self.code,
        }
    }
}

#[allow(dead_code)]
#[derive(sqlx::FromRow)]
struct TaskRow {
    id: String,
    document_id: String,
    order_index: i64,
    task_text: String,
}

#[allow(dead_code)]
#[derive(sqlx::FromRow)]
struct HourRow {
    id: String,
    document_id: String,
    grade: i64,
    hours_per_week: f64,
    hours_per_year: i64,
}

#[allow(dead_code)]
#[derive(sqlx::FromRow)]
struct QuarterRow {
    id: String,
    document_id: String,
    grade: i64,
    quarter_number: i64,
}

#[allow(dead_code)]
#[derive(sqlx::FromRow)]
struct SectionRow {
    id: String,
    quarter_id: String,
    name: String,
    order_index: i64,
}

#[allow(dead_code)]
#[derive(sqlx::FromRow)]
struct TopicRow {
    id: String,
    section_id: String,
    name: String,
    order_index: i64,
}

/// Удаляет все документы ТУП и связанные данные (цели, задачи, нагрузку,
/// Долгосрочный план) единой транзакцией. Используется перед пакетным
/// переимпортом RU+KZ версий.
pub async fn delete_all_documents(pool: &SqlitePool) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;
    // Дочерние таблицы ссылаются на tup_documents с ON DELETE CASCADE,
    // поэтому достаточно удалить сами документы. Порядок безопасен.
    sqlx::query("DELETE FROM tup_documents")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// Результат полнотекстового поиска по ТУП.
#[derive(sqlx::FromRow)]
pub struct TupSearchHit {
    pub text: String,
    pub entity_type: String,
    pub entity_id: String,
    pub document_id: String,
    pub subject_id: String,
    pub target_grades: String,
    pub language: String,
    pub grade: Option<i64>,
    pub quarter_number: Option<i64>,
}

/// Полнотекстовый поиск по целям, разделам, темам и задачам ТУП (FTS5).
/// Каждое слово запроса ищется как отдельная фраза; результат ранжируется FTS.
pub async fn search_tup(
    pool: &SqlitePool,
    query: &str,
    limit: i64,
) -> Result<Vec<TupSearchHit>, DbError> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let match_expr = terms.join(" AND ");

    sqlx::query_as::<_, TupSearchHit>(
        "SELECT text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number
         FROM tup_fts WHERE tup_fts MATCH ?1 ORDER BY rank LIMIT ?2",
    )
    .bind(match_expr)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(DbError::from)
}

/// Обновляет язык документа (для пересоздания по казахскому приказу).
pub async fn delete_document_by_language(
    pool: &SqlitePool,
    subject_id: &str,
    target_grades: &str,
    direction: TupDirection,
    appendix_number: i64,
    language: &str,
) -> Result<(), DbError> {
    sqlx::query(
        "DELETE FROM tup_documents
         WHERE subject_id = ?1 AND target_grades = ?2 AND direction = ?3 AND appendix_number = ?4 AND language = ?5",
    )
    .bind(subject_id)
    .bind(target_grades)
    .bind(direction_to_sql(direction))
    .bind(appendix_number)
    .bind(language)
    .execute(pool)
    .await?;
    Ok(())
}


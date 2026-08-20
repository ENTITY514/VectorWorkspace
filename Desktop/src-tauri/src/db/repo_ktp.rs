//! Репозиторий КТП: сохранение и чтение планов/четвертей/уроков.
//! Транзакционно пишется агрегат; чтение собирает дерево plan → quarters → lessons.

use std::str::FromStr;

use chrono::NaiveDate;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::DbError;
use crate::domain::ids::{KtpLessonId, KtpPlanId, KtpQuarterId};
use crate::domain::invariants::LessonKind;
use crate::domain::ktp::{KtpLesson, KtpPlan, KtpQuarter, KtpStatus, LessonObjective};

#[derive(sqlx::FromRow)]
struct PlanRow {
    #[allow(dead_code)]
    id: String,
    subject_id: String,
    grade: i64,
    language: String,
    academic_year: String,
    total_hours: i64,
    status: String,
    created_at: String,
    updated_at: String,
    days_of_week: String,
}

#[derive(sqlx::FromRow)]
struct QuarterRow {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    ktp_id: String,
    quarter_number: i64,
    hours_per_week: i64,
}

#[derive(sqlx::FromRow)]
struct LessonRow {
    id: String,
    quarter_id: String,
    global_index: i64,
    quarter_index: i64,
    topic_title: String,
    section_name: String,
    lesson_type: String,
    planned_date: Option<String>,
    is_cancelled: i64,
    objectives_json: String,
}

fn kind_from_sql(s: &str) -> LessonKind {
    match s {
        "Sor" => LessonKind::Sor,
        "Soch" => LessonKind::Soch,
        "Revision" => LessonKind::Revision,
        _ => LessonKind::Standard,
    }
}

fn kind_to_sql(k: LessonKind) -> &'static str {
    k.as_str()
}

/// Сохраняет полный план КТП (транзакция: план + четверти + уроки + цели).
pub async fn save_plan(pool: &SqlitePool, plan: &KtpPlan) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO ktp_plans
            (id, subject_id, grade, language, academic_year, total_hours, status, created_at, updated_at, days_of_week)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )
    .bind(plan.id.to_string())
    .bind(&plan.subject_id)
    .bind(plan.grade)
    .bind(&plan.language)
    .bind(&plan.academic_year)
    .bind(plan.total_hours)
    .bind(plan.status.as_str())
    .bind(&plan.created_at)
    .bind(&plan.updated_at)
    .bind(&plan.days_of_week)
    .execute(&mut *tx)
    .await?;

    // Документ предмета для резолва кодов целей в id learning_objectives.
    let doc_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM tup_documents
         WHERE subject_id = ?1 AND language = ?2
           AND instr(target_grades, '-') > 0
           AND ?3 >= CAST(substr(target_grades, 1, instr(target_grades, '-') - 1) AS INTEGER)
           AND ?3 <= CAST(substr(target_grades, instr(target_grades, '-') + 1) AS INTEGER)
         LIMIT 1",
    )
    .bind(&plan.subject_id)
    .bind(&plan.language)
    .bind(plan.grade)
    .fetch_optional(&mut *tx)
    .await?;

    for q in &plan.quarters {
        sqlx::query(
            "INSERT INTO ktp_quarters (id, ktp_id, quarter_number, hours_per_week)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(q.id.to_string())
        .bind(q.ktp_id.to_string())
        .bind(q.quarter_number)
        .bind(q.hours_per_week)
        .execute(&mut *tx)
        .await?;

        for l in &q.lessons {
            let objectives_json =
                serde_json::to_string(&l.objectives).unwrap_or_else(|_| "[]".into());
            sqlx::query(
                "INSERT INTO ktp_lessons
                    (id, quarter_id, global_index, quarter_index, topic_title, section_name, lesson_type, planned_date, is_cancelled, objectives_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .bind(l.id.to_string())
            .bind(l.quarter_id.to_string())
            .bind(l.global_index)
            .bind(l.quarter_index)
            .bind(&l.topic_title)
            .bind(&l.section_name)
            .bind(kind_to_sql(l.lesson_type))
            .bind(l.planned_date.map(|d| d.to_string()))
            .bind(l.is_cancelled as i64)
            .bind(&objectives_json)
            .execute(&mut *tx)
            .await?;

            if let Some(doc) = &doc_id {
                for code in l.objective_codes() {
                    sqlx::query(
                        "INSERT OR IGNORE INTO ktp_lesson_objectives (lesson_id, objective_id)
                         SELECT ?1, id FROM learning_objectives WHERE document_id = ?2 AND code = ?3 LIMIT 1",
                    )
                    .bind(l.id.to_string())
                    .bind(doc)
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

/// Перезаписывает план целиком (используется редактором КТП после правок).
/// Удаляет старое дерево плана (каскадом: уроки → цели) и вставляет новое.
pub async fn replace_plan(pool: &SqlitePool, plan: &KtpPlan) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM ktp_plans WHERE id = ?1")
        .bind(plan.id.to_string())
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    save_plan(pool, plan).await
}

/// Читает план со всеми четвертями и уроками (включая цели с описаниями).
pub async fn load_plan(pool: &SqlitePool, plan_id: KtpPlanId) -> Result<Option<KtpPlan>, DbError> {
    let plan_row = sqlx::query_as::<_, PlanRow>(
        "SELECT id, subject_id, grade, language, academic_year, total_hours, status, created_at, updated_at, days_of_week
         FROM ktp_plans WHERE id = ?1",
    )
    .bind(plan_id.to_string())
    .fetch_optional(pool)
    .await?;

    let Some(pr) = plan_row else {
        return Ok(None);
    };

    let status = match pr.status.as_str() {
        "Validating" => KtpStatus::Validating,
        "Approved" => KtpStatus::Approved,
        "Archived" => KtpStatus::Archived,
        _ => KtpStatus::Draft,
    };

    let quarters = sqlx::query_as::<_, QuarterRow>(
        "SELECT id, ktp_id, quarter_number, hours_per_week FROM ktp_quarters
         WHERE ktp_id = ?1 ORDER BY quarter_number",
    )
    .bind(plan_id.to_string())
    .fetch_all(pool)
    .await?;

    let mut plan_quarters = Vec::new();
    for q in quarters {
        let lessons = sqlx::query_as::<_, LessonRow>(
            "SELECT id, quarter_id, global_index, quarter_index, topic_title, section_name, lesson_type, planned_date, is_cancelled, objectives_json
             FROM ktp_lessons WHERE quarter_id = ?1 ORDER BY quarter_index",
        )
        .bind(&q.id)
        .fetch_all(pool)
        .await?;

        let mut plan_lessons = Vec::new();
        for l in lessons {
            let mut objectives: Vec<LessonObjective> = serde_json::from_str(&l.objectives_json)
                .unwrap_or_else(|_| Vec::new());
            if objectives.is_empty() {
                // Старые планы без objectives_json: зеркало из junction-таблицы.
                let rows: Vec<(String, String)> = sqlx::query_as(
                    "SELECT lo.code, lo.description FROM ktp_lesson_objectives ko
                     JOIN learning_objectives lo ON lo.id = ko.objective_id
                     WHERE ko.lesson_id = ?1 ORDER BY lo.code",
                )
                .bind(&l.id)
                .fetch_all(pool)
                .await?;
                objectives = rows
                    .into_iter()
                    .map(|(code, description)| LessonObjective { code, description })
                    .collect();
            }

            plan_lessons.push(KtpLesson {
                id: KtpLessonId::from(Uuid::from_str(&l.id).unwrap_or_default()),
                quarter_id: KtpQuarterId::from(Uuid::from_str(&l.quarter_id).unwrap_or_default()),
                global_index: l.global_index,
                quarter_index: l.quarter_index,
                topic_title: l.topic_title,
                section_name: l.section_name,
                lesson_type: kind_from_sql(&l.lesson_type),
                planned_date: l.planned_date.as_deref().and_then(|s| NaiveDate::from_str(s).ok()),
                is_cancelled: l.is_cancelled != 0,
                objectives,
            });
        }

        plan_quarters.push(KtpQuarter {
            id: KtpQuarterId::from(Uuid::from_str(&q.id).unwrap_or_default()),
            ktp_id: plan_id,
            quarter_number: q.quarter_number,
            hours_per_week: q.hours_per_week,
            lessons: plan_lessons,
        });
    }

    Ok(Some(KtpPlan {
        id: plan_id,
        subject_id: pr.subject_id,
        grade: pr.grade,
        language: pr.language,
        academic_year: pr.academic_year,
        total_hours: pr.total_hours,
        status,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        days_of_week: pr.days_of_week,
        quarters: plan_quarters,
    }))
}

/// Обновляет расписание (даты уроков) и дни недели плана.
pub async fn update_schedule(
    pool: &SqlitePool,
    plan_id: KtpPlanId,
    days_of_week: &str,
    dates: &[(String, Option<NaiveDate>)],
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE ktp_plans SET days_of_week = ?1, updated_at = datetime('now') WHERE id = ?2")
        .bind(days_of_week)
        .bind(plan_id.to_string())
        .execute(&mut *tx)
        .await?;

    for (lesson_id, date) in dates {
        sqlx::query("UPDATE ktp_lessons SET planned_date = ?1 WHERE id = ?2")
            .bind(date.map(|d| d.to_string()))
            .bind(lesson_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// Список планов (карточки для редактора).
#[derive(sqlx::FromRow)]
pub struct KtpPlanRow {
    pub id: String,
    pub subject_id: String,
    pub grade: i64,
    pub language: String,
    pub academic_year: String,
    pub total_hours: i64,
    pub status: String,
    pub days_of_week: String,
}

pub async fn list_plans(pool: &SqlitePool) -> Result<Vec<KtpPlanRow>, DbError> {
    sqlx::query_as::<_, KtpPlanRow>(
        "SELECT id, subject_id, grade, language, academic_year, total_hours, status, days_of_week
         FROM ktp_plans ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(DbError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connect;
    use crate::domain::ids::TupSectionId;
    use crate::domain::tup::{
        FullTupDocument, LearningObjective, TupDirection, TupDocument, TupQuarter, TupSection,
        TupSubjectHours, TupTopic,
    };

    async fn stub_full_doc(pool: &SqlitePool) -> FullTupDocument {
        // Документ + цель, чтобы сохранить план с привязкой objective_codes.
        let doc = TupDocument::new(
            "130".into(),
            "2024-01-01".into(),
            1,
            "mathematics".into(),
            "RU".into(),
            "5-6".into(),
            TupDirection::Common,
        );
        sqlx::query(
            "INSERT INTO tup_documents (id, order_number, order_date, appendix_number, subject_id, language, target_grades)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(doc.id.to_string())
        .bind(&doc.order_number)
        .bind(&doc.order_date)
        .bind(doc.appendix_number)
        .bind(&doc.subject_id)
        .bind(&doc.language)
        .bind(&doc.target_grades)
        .execute(pool)
        .await
        .unwrap();

        let obj = LearningObjective::new(doc.id, 5, 1, 1, 1, "уметь считать".into(), "5.1.1.1".into());
        sqlx::query(
            "INSERT INTO learning_objectives (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(obj.id.to_string())
        .bind(doc.id.to_string())
        .bind(obj.grade)
        .bind(obj.section_number)
        .bind(obj.subsection_number)
        .bind(obj.objective_number)
        .bind(&obj.description)
        .bind(&obj.code)
        .execute(pool)
        .await
        .unwrap();

        let mut q = TupQuarter::new(doc.id, 5, 1);
        let sec = TupSection::new(q.id, "Раздел 1".into(), 0).with_topics(vec![TupTopic::new(
            TupSectionId::new(),
            "Тема 1".into(),
            0,
            vec!["5.1.1.1".into()],
        )]);
        q.sections = vec![sec];

        let doc_id = doc.id;
        FullTupDocument {
            document: doc,
            tasks: Vec::new(),
            hours: vec![TupSubjectHours::new(doc_id, 5, 2.0, 68)],
            objectives: vec![obj],
            quarters: vec![q],
        }
    }

    #[tokio::test]
    async fn save_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let full = stub_full_doc(&pool).await;

        let plan = crate::infra::ktp_service::generate_from_tup(
            &full,
            &crate::infra::ktp_service::GenerateParams {
                subject_id: "mathematics".into(),
                grade: 5,
                academic_year: "2026-2027".into(),
                start_year: 2026,
                days_of_week: vec![2, 4],
            },
        );

        save_plan(&pool, &plan).await.unwrap();
        let loaded = load_plan(&pool, plan.id).await.unwrap().expect("план");
        assert_eq!(loaded.quarters.len(), plan.quarters.len());
        let q0: usize = loaded.quarters[0].lessons.len();
        assert_eq!(q0, plan.quarters[0].lessons.len());
        // Привязка цели резолвится по коду 5.1.1.1.
        let codes: Vec<String> = loaded.quarters[0]
            .lessons
            .iter()
            .flat_map(|l| l.objective_codes().map(String::from))
            .collect();
        assert!(
            codes.iter().any(|c| c == "5.1.1.1"),
            "код 5.1.1.1 должен быть привязан, получили {codes:?}"
        );
        // Описание цели подтянуто из документа ТУП.
        let descs: Vec<&str> = loaded.quarters[0]
            .lessons
            .iter()
            .flat_map(|l| l.objectives.iter().map(|o| o.description.as_str()))
            .collect();
        assert!(
            descs.iter().any(|d| *d == "уметь считать"),
            "описание должно быть в плане, получили {descs:?}"
        );
        assert_eq!(loaded.language, "RU");
    }

    #[tokio::test]
    async fn replace_plan_rewrites_and_preserves_new_lessons() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let full = stub_full_doc(&pool).await;

        let plan = crate::infra::ktp_service::generate_from_tup(
            &full,
            &crate::infra::ktp_service::GenerateParams {
                subject_id: "mathematics".into(),
                grade: 5,
                academic_year: "2026-2027".into(),
                start_year: 2026,
                days_of_week: vec![2, 4],
            },
        );
        save_plan(&pool, &plan).await.unwrap();

        // Правка редактора: переименование темы первого урока.
        let mut edited = plan.clone();
        edited.quarters[0].lessons[0].topic_title = "Новая тема".into();
        replace_plan(&pool, &edited).await.unwrap();

        let reloaded = load_plan(&pool, plan.id).await.unwrap().expect("план");
        assert_eq!(reloaded.quarters[0].lessons[0].topic_title, "Новая тема");
        assert_eq!(
            reloaded.quarters[0].lessons.len(),
            edited.quarters[0].lessons.len()
        );
        // В БД ровно один план (старый удалён каскадом).
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ktp_plans")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
        let lessons: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ktp_lessons")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            lessons as usize,
            edited.quarters.iter().map(|q| q.lessons.len()).sum::<usize>()
        );
    }
}
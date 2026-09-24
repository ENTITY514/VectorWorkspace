//! Репозиторий КСП: документы, ревизии, справочник ценностей, уроки КТП для создания.

use sqlx::SqlitePool;

use crate::db::DbError;
use crate::domain::ids::KspId;
use crate::domain::ksp::{KspContent, KspDocument, KspStatus};

#[derive(sqlx::FromRow)]
struct DocRow {
    id: String,
    ktp_lesson_id: String,
    teacher_id: String,
    is_approved: i64,
    content: String,
    created_at: String,
    updated_at: String,
    status: String,
    language: String,
    schema_version: i64,
    class_name: String,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KspCardRow {
    pub id: String,
    pub ktp_lesson_id: String,
    pub ktp_plan_id: String,
    pub subject_id: String,
    pub grade: i64,
    pub language: String,
    pub academic_year: String,
    pub topic: String,
    pub section: String,
    pub class_name: String,
    pub status: String,
    pub planned_date: Option<String>,
    pub lesson_type: String,
    pub global_index: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonOfferRow {
    pub lesson_id: String,
    pub plan_id: String,
    pub subject_id: String,
    pub grade: i64,
    pub language: String,
    pub academic_year: String,
    pub topic_title: String,
    pub section_name: String,
    pub lesson_type: String,
    pub planned_date: Option<String>,
    pub global_index: i64,
    pub is_cancelled: i64,
    pub objectives_json: String,
    pub has_ksp: i64,
    pub ksp_id: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueRow {
    pub id: String,
    pub code: String,
    pub title_ru: String,
    pub title_kk: String,
}

fn row_to_doc(r: DocRow, plan_id: String) -> Result<KspDocument, DbError> {
    let content: KspContent = serde_json::from_str(&r.content)
        .map_err(|e| DbError::Validation(format!("КСП content: {e}")))?;
    Ok(KspDocument {
        id: r.id.parse().map_err(|e| DbError::Validation(format!("id: {e}")))?,
        ktp_lesson_id: r.ktp_lesson_id,
        ktp_plan_id: plan_id,
        teacher_id: r.teacher_id,
        class_name: r.class_name,
        status: KspStatus::parse(&r.status),
        language: r.language,
        schema_version: r.schema_version,
        is_approved: r.is_approved != 0,
        content,
        created_at: r.created_at,
        updated_at: r.updated_at,
    })
}

async fn plan_id_of_lesson(pool: &SqlitePool, lesson_id: &str) -> Result<String, DbError> {
    let id: Option<String> = sqlx::query_scalar(
        "SELECT q.ktp_id FROM ktp_lessons l JOIN ktp_quarters q ON q.id = l.quarter_id WHERE l.id = ?1",
    )
    .bind(lesson_id)
    .fetch_optional(pool)
    .await?;
    id.ok_or_else(|| DbError::Validation(format!("Урок КТП не найден: {lesson_id}")))
}

pub async fn list_documents(pool: &SqlitePool) -> Result<Vec<KspCardRow>, DbError> {
    sqlx::query_as::<_, KspCardRow>(
        "SELECT k.id, k.ktp_lesson_id, q.ktp_id AS ktp_plan_id, p.subject_id, p.grade,
                p.language, p.academic_year, l.topic_title AS topic, l.section_name AS section,
                k.class_name, k.status, l.planned_date, l.lesson_type, l.global_index, k.updated_at
         FROM ksp_documents k
         JOIN ktp_lessons l ON l.id = k.ktp_lesson_id
         JOIN ktp_quarters q ON q.id = l.quarter_id
         JOIN ktp_plans p ON p.id = q.ktp_id
         ORDER BY l.planned_date IS NULL, l.planned_date DESC, k.updated_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(DbError::from)
}

pub async fn list_lesson_offers(pool: &SqlitePool) -> Result<Vec<LessonOfferRow>, DbError> {
    sqlx::query_as::<_, LessonOfferRow>(
        "SELECT l.id AS lesson_id, p.id AS plan_id, p.subject_id, p.grade, p.language, p.academic_year,
                l.topic_title, l.section_name, l.lesson_type, l.planned_date, l.global_index,
                l.is_cancelled, l.objectives_json,
                CASE WHEN k.id IS NULL THEN 0 ELSE 1 END AS has_ksp,
                k.id AS ksp_id
         FROM ktp_lessons l
         JOIN ktp_quarters q ON q.id = l.quarter_id
         JOIN ktp_plans p ON p.id = q.ktp_id
         LEFT JOIN ksp_documents k ON k.ktp_lesson_id = l.id
         WHERE l.is_cancelled = 0
         ORDER BY p.subject_id, p.grade, l.global_index",
    )
    .fetch_all(pool)
    .await
    .map_err(DbError::from)
}

pub async fn get_document(pool: &SqlitePool, id: KspId) -> Result<Option<KspDocument>, DbError> {
    let row = sqlx::query_as::<_, DocRow>(
        "SELECT id, ktp_lesson_id, teacher_id, is_approved, content, created_at, updated_at,
                status, language, schema_version, class_name
         FROM ksp_documents WHERE id = ?1",
    )
    .bind(id.to_string())
    .fetch_optional(pool)
    .await?;
    match row {
        None => Ok(None),
        Some(r) => {
            let plan_id = plan_id_of_lesson(pool, &r.ktp_lesson_id).await.unwrap_or_default();
            Ok(Some(row_to_doc(r, plan_id)?))
        }
    }
}

pub async fn get_by_lesson(pool: &SqlitePool, lesson_id: &str) -> Result<Option<KspDocument>, DbError> {
    let row = sqlx::query_as::<_, DocRow>(
        "SELECT id, ktp_lesson_id, teacher_id, is_approved, content, created_at, updated_at,
                status, language, schema_version, class_name
         FROM ksp_documents WHERE ktp_lesson_id = ?1",
    )
    .bind(lesson_id)
    .fetch_optional(pool)
    .await?;
    match row {
        None => Ok(None),
        Some(r) => {
            let plan_id = plan_id_of_lesson(pool, &r.ktp_lesson_id).await.unwrap_or_default();
            Ok(Some(row_to_doc(r, plan_id)?))
        }
    }
}

pub async fn save_document(pool: &SqlitePool, doc: &KspDocument, author: &str, reason: Option<&str>) -> Result<(), DbError> {
    let content = serde_json::to_string(&doc.content)
        .map_err(|e| DbError::Validation(format!("serialize KСП: {e}")))?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    sqlx::query(
        "INSERT INTO ksp_documents
            (id, ktp_lesson_id, teacher_id, is_approved, content, created_at, updated_at, status, language, schema_version, class_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
            teacher_id = excluded.teacher_id,
            is_approved = excluded.is_approved,
            content = excluded.content,
            updated_at = excluded.updated_at,
            status = excluded.status,
            language = excluded.language,
            schema_version = excluded.schema_version,
            class_name = excluded.class_name",
    )
    .bind(doc.id.to_string())
    .bind(&doc.ktp_lesson_id)
    .bind(&doc.teacher_id)
    .bind(if doc.is_approved { 1 } else { 0 })
    .bind(&content)
    .bind(if doc.created_at.is_empty() { &now } else { &doc.created_at })
    .bind(&now)
    .bind(doc.status.as_str())
    .bind(&doc.language)
    .bind(doc.schema_version)
    .bind(&doc.class_name)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO ksp_revisions (id, ksp_id, content, author, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(doc.id.to_string())
    .bind(&content)
    .bind(author)
    .bind(reason)
    .bind(&now)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_document(pool: &SqlitePool, id: KspId) -> Result<(), DbError> {
    let res = sqlx::query("DELETE FROM ksp_documents WHERE id = ?1")
        .bind(id.to_string())
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(DbError::Validation(format!("КСП не найден: {id}")));
    }
    Ok(())
}

pub async fn list_values(pool: &SqlitePool) -> Result<Vec<ValueRow>, DbError> {
    sqlx::query_as::<_, ValueRow>(
        "SELECT id, code, title_ru, title_kk FROM value_components ORDER BY title_ru",
    )
    .fetch_all(pool)
    .await
    .map_err(DbError::from)
}

pub async fn default_teacher(pool: &SqlitePool) -> Result<(String, String), DbError> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT id, full_name FROM school_staff WHERE is_active = 1 ORDER BY role, full_name LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.unwrap_or_else(|| ("local".into(), String::new())))
}

pub async fn load_lesson_header(
    pool: &SqlitePool,
    lesson_id: &str,
) -> Result<Option<LessonOfferRow>, DbError> {
    sqlx::query_as::<_, LessonOfferRow>(
        "SELECT l.id AS lesson_id, p.id AS plan_id, p.subject_id, p.grade, p.language, p.academic_year,
                l.topic_title, l.section_name, l.lesson_type, l.planned_date, l.global_index,
                l.is_cancelled, l.objectives_json,
                CASE WHEN k.id IS NULL THEN 0 ELSE 1 END AS has_ksp,
                k.id AS ksp_id
         FROM ktp_lessons l
         JOIN ktp_quarters q ON q.id = l.quarter_id
         JOIN ktp_plans p ON p.id = q.ktp_id
         LEFT JOIN ksp_documents k ON k.ktp_lesson_id = l.id
         WHERE l.id = ?1",
    )
    .bind(lesson_id)
    .fetch_optional(pool)
    .await
    .map_err(DbError::from)
}

const LESSON_SELECT: &str = "SELECT l.id AS lesson_id, p.id AS plan_id, p.subject_id, p.grade, p.language, p.academic_year,
                l.topic_title, l.section_name, l.lesson_type, l.planned_date, l.global_index,
                l.is_cancelled, l.objectives_json,
                CASE WHEN k.id IS NULL THEN 0 ELSE 1 END AS has_ksp,
                k.id AS ksp_id
         FROM ktp_lessons l
         JOIN ktp_quarters q ON q.id = l.quarter_id
         JOIN ktp_plans p ON p.id = q.ktp_id
         LEFT JOIN ksp_documents k ON k.ktp_lesson_id = l.id";

/// Все уроки планов, включая отменённые — для связи КТП↔КСП.
pub async fn list_all_lesson_offers(pool: &SqlitePool) -> Result<Vec<LessonOfferRow>, DbError> {
    let sql = format!("{LESSON_SELECT} ORDER BY p.subject_id, p.grade, l.global_index");
    sqlx::query_as::<_, LessonOfferRow>(&sql)
        .fetch_all(pool)
        .await
        .map_err(DbError::from)
}

/// Предыдущий урок того же плана: сначала живой, иначе любой с меньшим индексом.
pub async fn previous_lesson(
    pool: &SqlitePool,
    lesson_id: &str,
) -> Result<Option<LessonOfferRow>, DbError> {
    let Some(cur) = load_lesson_header(pool, lesson_id).await? else {
        return Ok(None);
    };
    let live_sql = format!("{LESSON_SELECT} WHERE p.id = ?1 AND l.global_index < ?2 AND l.is_cancelled = 0 ORDER BY l.global_index DESC LIMIT 1");
    let live: Option<LessonOfferRow> = sqlx::query_as(&live_sql)
        .bind(&cur.plan_id)
        .bind(cur.global_index)
        .fetch_optional(pool)
        .await?;
    if live.is_some() {
        return Ok(live);
    }
    let any_sql = format!("{LESSON_SELECT} WHERE p.id = ?1 AND l.global_index < ?2 ORDER BY l.global_index DESC LIMIT 1");
    sqlx::query_as(&any_sql)
        .bind(&cur.plan_id)
        .bind(cur.global_index)
        .fetch_optional(pool)
        .await
        .map_err(DbError::from)
}

pub async fn neighbor_lessons(
    pool: &SqlitePool,
    lesson_id: &str,
) -> Result<Vec<LessonOfferRow>, DbError> {
    let cur = load_lesson_header(pool, lesson_id).await?;
    let Some(cur) = cur else { return Ok(Vec::new()) };
    sqlx::query_as::<_, LessonOfferRow>(
        "SELECT l.id AS lesson_id, p.id AS plan_id, p.subject_id, p.grade, p.language, p.academic_year,
                l.topic_title, l.section_name, l.lesson_type, l.planned_date, l.global_index,
                l.is_cancelled, l.objectives_json,
                CASE WHEN k.id IS NULL THEN 0 ELSE 1 END AS has_ksp,
                k.id AS ksp_id
         FROM ktp_lessons l
         JOIN ktp_quarters q ON q.id = l.quarter_id
         JOIN ktp_plans p ON p.id = q.ktp_id
         LEFT JOIN ksp_documents k ON k.ktp_lesson_id = l.id
         WHERE p.id = ?1 AND l.global_index BETWEEN ?2 AND ?3
         ORDER BY l.global_index",
    )
    .bind(&cur.plan_id)
    .bind(cur.global_index - 1)
    .bind(cur.global_index + 1)
    .fetch_all(pool)
    .await
    .map_err(DbError::from)
}

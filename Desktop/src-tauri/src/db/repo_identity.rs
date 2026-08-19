//! Репозиторий идентичности: школа, штат, профиль, физические классы.
//! Temporal integrity: активация новой должности той же роли закрывает
//! предыдущую активную ревизию (`is_active = 0`, `valid_to`).

use std::str::FromStr;

use chrono::NaiveDate;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::DbError;
use crate::domain::identity::{
    ClassGroup, Language, School, SchoolStaff, SchoolState, StaffRole, TeacherProfile,
};
use crate::domain::ids::{ClassId, SchoolId, StaffId, TeacherProfileId};

#[derive(sqlx::FromRow)]
struct SchoolRow {
    id: String,
    name: String,
    region: Option<String>,
    created_at: String,
}

#[derive(sqlx::FromRow)]
struct StaffRow {
    id: String,
    school_id: String,
    role: String,
    full_name: String,
    is_active: i64,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ProfileRow {
    id: String,
    school_id: String,
    full_name: String,
    category: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ClassRow {
    id: String,
    school_id: String,
    grade: i64,
    letter: String,
    language: String,
}

fn uuid_of(s: &str) -> Uuid {
    Uuid::from_str(s).unwrap_or_default()
}

// ---------- Школа ----------

pub async fn get_school(pool: &SqlitePool, id: SchoolId) -> Result<Option<School>, DbError> {
    let row = sqlx::query_as::<_, SchoolRow>(
        "SELECT id, name, region, created_at FROM schools WHERE id = ?1",
    )
    .bind(id.to_string())
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| School {
        id: SchoolId::from(uuid_of(&r.id)),
        name: r.name,
        region: r.region,
        created_at: r.created_at,
    }))
}

/// Первая школа (single-user): рабочая станция держит одно учреждение.
pub async fn get_primary_school(pool: &SqlitePool) -> Result<Option<School>, DbError> {
    let row = sqlx::query_as::<_, SchoolRow>(
        "SELECT id, name, region, created_at FROM schools ORDER BY created_at LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| School {
        id: SchoolId::from(uuid_of(&r.id)),
        name: r.name,
        region: r.region,
        created_at: r.created_at,
    }))
}

pub async fn create_school(pool: &SqlitePool, school: &School) -> Result<(), DbError> {
    sqlx::query("INSERT INTO schools (id, name, region, created_at) VALUES (?1, ?2, ?3, ?4)")
        .bind(school.id.to_string())
        .bind(&school.name)
        .bind(&school.region)
        .bind(&school.created_at)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_school(pool: &SqlitePool, school: &School) -> Result<(), DbError> {
    sqlx::query("UPDATE schools SET name = ?1, region = ?2 WHERE id = ?3")
        .bind(&school.name)
        .bind(&school.region)
        .bind(school.id.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_school(pool: &SqlitePool, id: SchoolId) -> Result<(), DbError> {
    sqlx::query("DELETE FROM schools WHERE id = ?1")
        .bind(id.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

// ---------- Штат (school_staff) ----------

fn staff_from_row(r: StaffRow) -> SchoolStaff {
    SchoolStaff {
        id: StaffId::from(uuid_of(&r.id)),
        school_id: SchoolId::from(uuid_of(&r.school_id)),
        role: StaffRole::from_str(&r.role).unwrap_or(StaffRole::Teacher),
        full_name: r.full_name,
        is_active: r.is_active != 0,
        valid_from: r.valid_from.as_deref().and_then(|s| NaiveDate::from_str(s).ok()),
        valid_to: r.valid_to.as_deref().and_then(|s| NaiveDate::from_str(s).ok()),
    }
}

pub async fn list_staff(pool: &SqlitePool, school_id: SchoolId) -> Result<Vec<SchoolStaff>, DbError> {
    let rows = sqlx::query_as::<_, StaffRow>(
        "SELECT id, school_id, role, full_name, is_active, valid_from, valid_to
         FROM school_staff WHERE school_id = ?1 ORDER BY is_active DESC, role, full_name",
    )
    .bind(school_id.to_string())
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(staff_from_row).collect())
}

/// Сохраняет должность. Если запись активна и уже есть активная должность той же
/// роли — закрывает её (temporal integrity) в одной транзакции.
pub async fn save_staff(pool: &SqlitePool, staff: &SchoolStaff) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    if staff.is_active {
        sqlx::query(
            "UPDATE school_staff
             SET is_active = 0, valid_to = COALESCE(?1, valid_to)
             WHERE school_id = ?2 AND role = ?3 AND is_active = 1 AND id != ?4",
        )
        .bind(staff.valid_from.map(|d| d.to_string()))
        .bind(staff.school_id.to_string())
        .bind(staff.role.as_str())
        .bind(staff.id.to_string())
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO school_staff (id, school_id, role, full_name, is_active, valid_from, valid_to)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
            role = excluded.role,
            full_name = excluded.full_name,
            is_active = excluded.is_active,
            valid_from = excluded.valid_from,
            valid_to = excluded.valid_to",
    )
    .bind(staff.id.to_string())
    .bind(staff.school_id.to_string())
    .bind(staff.role.as_str())
    .bind(&staff.full_name)
    .bind(staff.is_active as i64)
    .bind(staff.valid_from.map(|d| d.to_string()))
    .bind(staff.valid_to.map(|d| d.to_string()))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

/// Деактивирует должность (увольнение): `is_active = 0`, `valid_to` = сегодня.
pub async fn deactivate_staff(pool: &SqlitePool, id: StaffId) -> Result<(), DbError> {
    sqlx::query(
        "UPDATE school_staff SET is_active = 0, valid_to = date('now', 'localtime')
         WHERE id = ?1",
    )
    .bind(id.to_string())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_staff(pool: &SqlitePool, id: StaffId) -> Result<Option<SchoolStaff>, DbError> {
    let row = sqlx::query_as::<_, StaffRow>(
        "SELECT id, school_id, role, full_name, is_active, valid_from, valid_to
         FROM school_staff WHERE id = ?1",
    )
    .bind(id.to_string())
    .fetch_optional(pool)
    .await?;

    Ok(row.map(staff_from_row))
}

// ---------- Профиль учителя ----------

fn profile_from_row(r: ProfileRow) -> TeacherProfile {
    TeacherProfile {
        id: TeacherProfileId::from(uuid_of(&r.id)),
        school_id: SchoolId::from(uuid_of(&r.school_id)),
        full_name: r.full_name,
        category: r.category,
    }
}

pub async fn get_profile(
    pool: &SqlitePool,
    school_id: SchoolId,
) -> Result<Option<TeacherProfile>, DbError> {
    let row = sqlx::query_as::<_, ProfileRow>(
        "SELECT id, school_id, full_name, category FROM teacher_profiles
         WHERE school_id = ?1 LIMIT 1",
    )
    .bind(school_id.to_string())
    .fetch_optional(pool)
    .await?;

    Ok(row.map(profile_from_row))
}

/// Single-user: один профиль на школу. Повторный вызов обновляет ту же запись
/// (сохраняя исходный id — на него могут ссылаться сгенерированные документы).
pub async fn upsert_profile(pool: &SqlitePool, profile: &TeacherProfile) -> Result<(), DbError> {
    let existing_id: Option<String> =
        sqlx::query_scalar("SELECT id FROM teacher_profiles WHERE school_id = ?1 LIMIT 1")
            .bind(profile.school_id.to_string())
            .fetch_optional(pool)
            .await?;

    match existing_id {
        Some(id) => {
            sqlx::query("UPDATE teacher_profiles SET full_name = ?1, category = ?2 WHERE id = ?3")
                .bind(&profile.full_name)
                .bind(&profile.category)
                .bind(id)
                .execute(pool)
                .await?;
        }
        None => {
            sqlx::query(
                "INSERT INTO teacher_profiles (id, school_id, full_name, category)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(profile.id.to_string())
            .bind(profile.school_id.to_string())
            .bind(&profile.full_name)
            .bind(&profile.category)
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}

// ---------- Физические классы ----------

fn class_from_row(r: ClassRow) -> ClassGroup {
    ClassGroup {
        id: ClassId::from(uuid_of(&r.id)),
        school_id: SchoolId::from(uuid_of(&r.school_id)),
        grade: r.grade as u8,
        letter: r.letter,
        language: Language::from_str(&r.language).unwrap_or(Language::Ru),
    }
}

pub async fn list_classes(
    pool: &SqlitePool,
    school_id: SchoolId,
) -> Result<Vec<ClassGroup>, DbError> {
    let rows = sqlx::query_as::<_, ClassRow>(
        "SELECT id, school_id, grade, letter, language
         FROM classes WHERE school_id = ?1 ORDER BY grade, letter",
    )
    .bind(school_id.to_string())
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(class_from_row).collect())
}

pub async fn save_class(pool: &SqlitePool, class: &ClassGroup) -> Result<(), DbError> {
    sqlx::query(
        "INSERT INTO classes (id, school_id, grade, letter, language)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            grade = excluded.grade,
            letter = excluded.letter,
            language = excluded.language",
    )
    .bind(class.id.to_string())
    .bind(class.school_id.to_string())
    .bind(class.grade as i64)
    .bind(&class.letter)
    .bind(class.language.as_str())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_class(pool: &SqlitePool, id: ClassId) -> Result<(), DbError> {
    sqlx::query("DELETE FROM classes WHERE id = ?1")
        .bind(id.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

// ---------- Агрегат ----------

/// Полное состояние учреждения (школа + штат + профиль + классы).
pub async fn get_school_state(pool: &SqlitePool) -> Result<SchoolState, DbError> {
    let school = get_primary_school(pool).await?;

    let (staff, profile, classes) = match &school {
        Some(s) => (
            list_staff(pool, s.id).await?,
            get_profile(pool, s.id).await?,
            list_classes(pool, s.id).await?,
        ),
        None => (Vec::new(), None, Vec::new()),
    };

    Ok(SchoolState {
        school,
        staff,
        profile,
        classes,
    })
}

/// Создаёт учреждение целиком (онбординг) в одной транзакции:
/// школа + директор + профиль учителя.
pub async fn create_school_state(
    pool: &SqlitePool,
    school: &School,
    director: &SchoolStaff,
    profile: &TeacherProfile,
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    sqlx::query("INSERT INTO schools (id, name, region, created_at) VALUES (?1, ?2, ?3, ?4)")
        .bind(school.id.to_string())
        .bind(&school.name)
        .bind(&school.region)
        .bind(&school.created_at)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO school_staff (id, school_id, role, full_name, is_active, valid_from, valid_to)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, NULL)",
    )
    .bind(director.id.to_string())
    .bind(director.school_id.to_string())
    .bind(director.role.as_str())
    .bind(&director.full_name)
    .bind(director.valid_from.map(|d| d.to_string()))
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO teacher_profiles (id, school_id, full_name, category)
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(profile.id.to_string())
    .bind(profile.school_id.to_string())
    .bind(&profile.full_name)
    .bind(&profile.category)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connect;

    async fn school(pool: &SqlitePool) -> School {
        let s = School::new("СШ №1".into(), Some("Костанай".into())).unwrap();
        create_school(pool, &s).await.unwrap();
        s
    }

    #[tokio::test]
    async fn school_crud_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();

        let s = school(&pool).await;
        let loaded = get_school(&pool, s.id).await.unwrap().expect("школа");
        assert_eq!(loaded.name, "СШ №1");
        assert_eq!(loaded.region.as_deref(), Some("Костанай"));

        let mut renamed = loaded.clone();
        renamed.name = "СШ №2".into();
        renamed.region = None;
        update_school(&pool, &renamed).await.unwrap();

        let reloaded = get_school(&pool, s.id).await.unwrap().unwrap();
        assert_eq!(reloaded.name, "СШ №2");
        assert_eq!(reloaded.region, None);

        delete_school(&pool, s.id).await.unwrap();
        assert!(get_school(&pool, s.id).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn activating_new_director_closes_previous() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let s = school(&pool).await;

        let first = SchoolStaff::new(s.id, StaffRole::Director, "Первый".into(), None).unwrap();
        save_staff(&pool, &first).await.unwrap();

        let second = SchoolStaff::new(s.id, StaffRole::Director, "Второй".into(), None).unwrap();
        save_staff(&pool, &second).await.unwrap();

        let staff = list_staff(&pool, s.id).await.unwrap();
        let dirs: Vec<&SchoolStaff> = staff
            .iter()
            .filter(|x| x.role == StaffRole::Director)
            .collect();
        assert_eq!(dirs.len(), 2);

        let old = staff.iter().find(|x| x.full_name == "Первый").unwrap();
        assert!(!old.is_active, "предыдущий директор должен быть закрыт");
        assert!(old.valid_to.is_some(), "valid_to предыдущего директора выставлен");

        let current = staff.iter().find(|x| x.full_name == "Второй").unwrap();
        assert!(current.is_active);
        assert_eq!(current.valid_to, None);
    }

    #[tokio::test]
    async fn deactivate_staff_marks_inactive() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let s = school(&pool).await;

        let head = SchoolStaff::new(s.id, StaffRole::MethodHead, "Зам".into(), None).unwrap();
        save_staff(&pool, &head).await.unwrap();

        deactivate_staff(&pool, head.id).await.unwrap();
        let loaded = get_staff(&pool, head.id).await.unwrap().expect("должность");
        assert!(!loaded.is_active);
        assert!(loaded.valid_to.is_some());
    }

    #[tokio::test]
    async fn profile_upsert_single_row() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let s = school(&pool).await;

        let p1 = TeacherProfile::new(s.id, "Учитель А".into(), Some("модератор".into())).unwrap();
        upsert_profile(&pool, &p1).await.unwrap();
        let p2 = TeacherProfile::new(s.id, "Учитель Б".into(), None).unwrap();
        upsert_profile(&pool, &p2).await.unwrap();

        let loaded = get_profile(&pool, s.id).await.unwrap().expect("профиль");
        assert_eq!(loaded.full_name, "Учитель Б");
        assert_eq!(loaded.category, None);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM teacher_profiles")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1, "single-user: в БД ровно один профиль");
    }

    #[tokio::test]
    async fn class_crud_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let s = school(&pool).await;

        let c1 = ClassGroup::new(s.id, 7, "А".into(), Language::Ru).unwrap();
        let c2 = ClassGroup::new(s.id, 8, "Б".into(), Language::Kk).unwrap();
        save_class(&pool, &c1).await.unwrap();
        save_class(&pool, &c2).await.unwrap();

        let classes = list_classes(&pool, s.id).await.unwrap();
        assert_eq!(classes.len(), 2);
        assert_eq!(classes[0].grade, 7);
        assert_eq!(classes[1].language, Language::Kk);

        let mut edited = c1.clone();
        edited.letter = "В".into();
        save_class(&pool, &edited).await.unwrap();

        let classes = list_classes(&pool, s.id).await.unwrap();
        assert!(classes.iter().any(|c| c.letter == "В"));

        delete_class(&pool, c1.id).await.unwrap();
        let classes = list_classes(&pool, s.id).await.unwrap();
        assert_eq!(classes.len(), 1);
    }

    #[tokio::test]
    async fn db_constraints_reject_bad_grade_and_language() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();
        let s = school(&pool).await;

        // grade вне 1..12 и язык вне RU/KK отвергаются CHECK-констрейнтами БД.
        let bad_grade = sqlx::query(
            "INSERT INTO classes (id, school_id, grade, letter, language)
             VALUES ('bad-grade', ?1, 13, 'А', 'RU')",
        )
        .bind(s.id.to_string())
        .execute(&pool)
        .await;
        assert!(bad_grade.is_err(), "grade 13 должен быть отвергнут БД");

        let bad_lang = sqlx::query(
            "INSERT INTO classes (id, school_id, grade, letter, language)
             VALUES ('bad-lang', ?1, 7, 'А', 'XX')",
        )
        .bind(s.id.to_string())
        .execute(&pool)
        .await;
        assert!(bad_lang.is_err(), "language XX должен быть отвергнут БД");
    }

    #[tokio::test]
    async fn school_state_aggregates_all() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("t.db")).await.unwrap();

        let empty = get_school_state(&pool).await.unwrap();
        assert!(!empty.is_onboarded());

        let school = School::new("Гимназия".into(), None).unwrap();
        let director =
            SchoolStaff::new(school.id, StaffRole::Director, "Директор".into(), None).unwrap();
        let profile = TeacherProfile::new(school.id, "Профиль".into(), None).unwrap();
        create_school_state(&pool, &school, &director, &profile).await.unwrap();
        save_class(&pool, &ClassGroup::new(school.id, 9, "А".into(), Language::Ru).unwrap())
            .await
            .unwrap();

        let state = get_school_state(&pool).await.unwrap();
        assert!(state.is_onboarded());
        assert_eq!(state.school.as_ref().unwrap().name, "Гимназия");
        assert_eq!(state.staff.len(), 1);
        assert_eq!(state.staff[0].role, StaffRole::Director);
        assert_eq!(state.profile.as_ref().unwrap().full_name, "Профиль");
        assert_eq!(state.classes.len(), 1);
        assert_eq!(state.classes[0].grade, 9);
    }
}
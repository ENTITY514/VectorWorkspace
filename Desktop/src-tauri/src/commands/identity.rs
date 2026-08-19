//! Команды идентичности (Фаза 2): школа, штат, профиль учителя, классы.
//! Онбординг при первом запуске и экран «Настройки школы».

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use uuid::Uuid;

use crate::commands::AppState;
use crate::db;
use crate::domain::identity::{
    ClassGroup, Language, School, SchoolStaff, SchoolState, StaffRole, TeacherProfile,
};
use crate::domain::ids::{ClassId, SchoolId, StaffId};

// ---------- DTO (выдача UI) ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolDto {
    pub id: String,
    pub name: String,
    pub region: Option<String>,
    pub created_at: String,
}

impl From<&School> for SchoolDto {
    fn from(s: &School) -> Self {
        Self {
            id: s.id.to_string(),
            name: s.name.clone(),
            region: s.region.clone(),
            created_at: s.created_at.clone(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffDto {
    pub id: String,
    pub school_id: String,
    pub role: String,
    pub role_label: String,
    pub full_name: String,
    pub is_active: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
}

impl From<&SchoolStaff> for StaffDto {
    fn from(s: &SchoolStaff) -> Self {
        Self {
            id: s.id.to_string(),
            school_id: s.school_id.to_string(),
            role: s.role.as_str().to_string(),
            role_label: s.role.label().to_string(),
            full_name: s.full_name.clone(),
            is_active: s.is_active,
            valid_from: s.valid_from.map(|d| d.to_string()),
            valid_to: s.valid_to.map(|d| d.to_string()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDto {
    pub id: String,
    pub school_id: String,
    pub full_name: String,
    pub category: Option<String>,
}

impl From<&TeacherProfile> for ProfileDto {
    fn from(p: &TeacherProfile) -> Self {
        Self {
            id: p.id.to_string(),
            school_id: p.school_id.to_string(),
            full_name: p.full_name.clone(),
            category: p.category.clone(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassDto {
    pub id: String,
    pub school_id: String,
    pub grade: i64,
    pub letter: String,
    pub language: String,
}

impl From<&ClassGroup> for ClassDto {
    fn from(c: &ClassGroup) -> Self {
        Self {
            id: c.id.to_string(),
            school_id: c.school_id.to_string(),
            grade: c.grade as i64,
            letter: c.letter.clone(),
            language: c.language.as_str().to_string(),
        }
    }
}

/// Полное состояние учреждения для онбординга и настроек.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolStateDto {
    pub onboarded: bool,
    pub school: Option<SchoolDto>,
    pub staff: Vec<StaffDto>,
    pub profile: Option<ProfileDto>,
    pub classes: Vec<ClassDto>,
}

impl From<&SchoolState> for SchoolStateDto {
    fn from(s: &SchoolState) -> Self {
        Self {
            onboarded: s.is_onboarded(),
            school: s.school.as_ref().map(SchoolDto::from),
            staff: s.staff.iter().map(StaffDto::from).collect(),
            profile: s.profile.as_ref().map(ProfileDto::from),
            classes: s.classes.iter().map(ClassDto::from).collect(),
        }
    }
}

// ---------- Входные DTO (от UI) ----------

/// Первый запуск: школа + директор + профиль учителя.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardSchoolIn {
    pub school_name: String,
    pub region: Option<String>,
    pub teacher_full_name: String,
    pub teacher_category: Option<String>,
    pub director_full_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSchoolIn {
    pub id: String,
    pub name: String,
    pub region: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStaffIn {
    pub id: Option<String>,
    pub school_id: String,
    pub role: String,
    pub full_name: String,
    pub valid_from: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProfileIn {
    pub full_name: String,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveClassIn {
    pub id: Option<String>,
    pub school_id: String,
    pub grade: i64,
    pub letter: String,
    pub language: String,
}

// ---------- Команды ----------

/// Состояние учреждения: используется для онбординга и экрана настроек.
#[tauri::command]
pub async fn get_school_state(
    state: tauri::State<'_, AppState>,
) -> Result<SchoolStateDto, String> {
    let school_state = db::repo_identity::get_school_state(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(SchoolStateDto::from(&school_state))
}

/// Онбординг: школа + директор + профиль учителя в одной транзакции.
#[tauri::command]
pub async fn onboard_school(
    state: tauri::State<'_, AppState>,
    input: OnboardSchoolIn,
) -> Result<SchoolStateDto, String> {
    let school = School::new(input.school_name, input.region).map_err(|e| e.to_string())?;
    let director =
        SchoolStaff::new(school.id, StaffRole::Director, input.director_full_name, None)
            .map_err(|e| e.to_string())?;
    let profile =
        TeacherProfile::new(school.id, input.teacher_full_name, input.teacher_category)
            .map_err(|e| e.to_string())?;

    db::repo_identity::create_school_state(&state.pool, &school, &director, &profile)
        .await
        .map_err(|e| e.to_string())?;

    let school_state = db::repo_identity::get_school_state(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(SchoolStateDto::from(&school_state))
}

/// Редактирование данных школы.
#[tauri::command]
pub async fn save_school(
    state: tauri::State<'_, AppState>,
    input: SaveSchoolIn,
) -> Result<SchoolDto, String> {
    let id = SchoolId::from(Uuid::parse_str(&input.id).map_err(|e| e.to_string())?);
    let mut school = db::repo_identity::get_school(&state.pool, id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Школа не найдена: {}", input.id))?;

    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Школа: имя не может быть пустым".into());
    }
    school.name = name;
    school.region = input.region.map(|r| r.trim().to_string()).filter(|r| !r.is_empty());

    db::repo_identity::update_school(&state.pool, &school)
        .await
        .map_err(|e| e.to_string())?;
    Ok(SchoolDto::from(&school))
}

/// Создание или обновление должности. Активация закрывает предыдущую ревизию той же роли.
#[tauri::command]
pub async fn save_staff(
    state: tauri::State<'_, AppState>,
    input: SaveStaffIn,
) -> Result<StaffDto, String> {
    let school_id = SchoolId::from(Uuid::parse_str(&input.school_id).map_err(|e| e.to_string())?);
    let role = StaffRole::from_str(&input.role).map_err(|e| e.to_string())?;
    let valid_from = input
        .valid_from
        .as_deref()
        .map(|s| NaiveDate::from_str(s))
        .transpose()
        .map_err(|e| e.to_string())?;

    let staff = match input.id {
        Some(id) => {
            let id = StaffId::from(Uuid::parse_str(&id).map_err(|e| e.to_string())?);
            let mut existing = db::repo_identity::get_staff(&state.pool, id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Должность не найдена: {id}"))?;
            existing.role = role;
            existing.full_name = input.full_name.trim().to_string();
            if existing.full_name.is_empty() {
                return Err("Сотрудник: имя не может быть пустым".into());
            }
            existing.valid_from = valid_from.or(existing.valid_from);
            existing
        }
        None => {
            SchoolStaff::new(school_id, role, input.full_name, valid_from).map_err(|e| e.to_string())?
        }
    };

    db::repo_identity::save_staff(&state.pool, &staff)
        .await
        .map_err(|e| e.to_string())?;
    Ok(StaffDto::from(&staff))
}

/// Увольнение: `is_active = 0`, `valid_to` = сегодня.
#[tauri::command]
pub async fn deactivate_staff(
    state: tauri::State<'_, AppState>,
    staff_id: String,
) -> Result<StaffDto, String> {
    let id = StaffId::from(Uuid::parse_str(&staff_id).map_err(|e| e.to_string())?);
    db::repo_identity::deactivate_staff(&state.pool, id)
        .await
        .map_err(|e| e.to_string())?;
    let staff = db::repo_identity::get_staff(&state.pool, id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Должность не найдена: {staff_id}"))?;
    Ok(StaffDto::from(&staff))
}

/// Профиль учителя (single-user, upsert).
#[tauri::command]
pub async fn save_profile(
    state: tauri::State<'_, AppState>,
    input: SaveProfileIn,
) -> Result<ProfileDto, String> {
    let state_agg = db::repo_identity::get_school_state(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let school = state_agg
        .school
        .ok_or_else(|| "Школа не создана: сначала пройдите онбординг".to_string())?;

    let profile = match state_agg.profile {
        Some(mut p) => {
            p.full_name = input.full_name.trim().to_string();
            if p.full_name.is_empty() {
                return Err("Профиль учителя: имя не может быть пустым".into());
            }
            p.category = input.category.map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
            p
        }
        None => {
            TeacherProfile::new(school.id, input.full_name, input.category).map_err(|e| e.to_string())?
        }
    };

    db::repo_identity::upsert_profile(&state.pool, &profile)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ProfileDto::from(&profile))
}

/// Создание или обновление физического класса.
#[tauri::command]
pub async fn save_class(
    state: tauri::State<'_, AppState>,
    input: SaveClassIn,
) -> Result<ClassDto, String> {
    let school_id = SchoolId::from(Uuid::parse_str(&input.school_id).map_err(|e| e.to_string())?);
    let language = Language::from_str(&input.language).map_err(|e| e.to_string())?;
    let grade = input.grade as u8;

    let class = match input.id {
        Some(id) => {
            let id = ClassId::from(Uuid::parse_str(&id).map_err(|e| e.to_string())?);
            let classes = db::repo_identity::list_classes(&state.pool, school_id)
                .await
                .map_err(|e| e.to_string())?;
            let mut existing = classes
                .into_iter()
                .find(|c| c.id == id)
                .ok_or_else(|| format!("Класс не найден: {id}"))?;
            existing.grade = grade;
            existing.letter = input.letter.trim().to_uppercase();
            existing.language = language;
            if !(1..=12).contains(&existing.grade) {
                return Err(format!("Класс {}: допустимы уровни 1–12", existing.grade));
            }
            if existing.letter.is_empty() {
                return Err("Буква класса не может быть пустой".into());
            }
            existing
        }
        None => ClassGroup::new(school_id, grade, input.letter, language).map_err(|e| e.to_string())?,
    };

    db::repo_identity::save_class(&state.pool, &class)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ClassDto::from(&class))
}

/// Удаление физического класса.
#[tauri::command]
pub async fn delete_class(
    state: tauri::State<'_, AppState>,
    class_id: String,
) -> Result<(), String> {
    let id = ClassId::from(Uuid::parse_str(&class_id).map_err(|e| e.to_string())?);
    db::repo_identity::delete_class(&state.pool, id)
        .await
        .map_err(|e| e.to_string())
}
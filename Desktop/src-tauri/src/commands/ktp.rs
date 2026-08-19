//! Команды КТП (Фаза 4): календарь РК, генерация плана из ТУП,
//! авторасчёт дат, валидация инвариантов оценивания.

use chrono::NaiveDate;
use serde::Serialize;
use uuid::Uuid;

use crate::commands::AppState;
use crate::db;
use crate::domain::ids::{KtpPlanId, TupDocumentId};
use crate::domain::ktp::KtpPlan;
use crate::domain::rk_calendar::RkCalendar;
use crate::infra::ktp_service::{
    assign_dates, generate_from_tup, validate_invariants, GenerateParams, InvariantReport,
};

/// Период производственного календаря РК для UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarPeriodDto {
    pub name: String,
    pub start: String,
    pub end: String,
}

/// Сводка календаря РК на учебный год.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RkCalendarDto {
    pub start_year: i32,
    pub quarters: Vec<CalendarPeriodDto>,
    pub vacations: Vec<CalendarPeriodDto>,
    pub holidays: Vec<String>,
}

/// Начальные значения календаря РК для учебного года (Этап 1).
#[tauri::command]
pub fn get_rk_calendar_defaults(start_year: i32) -> RkCalendarDto {
    let cal = RkCalendar::for_academic_year(start_year);
    RkCalendarDto {
        start_year,
        quarters: cal
            .quarters
            .iter()
            .map(|q| CalendarPeriodDto {
                name: format!("{} четверть", q.quarter_number),
                start: q.start.to_string(),
                end: q.end.to_string(),
            })
            .collect(),
        vacations: cal
            .vacations
            .iter()
            .map(|v| CalendarPeriodDto {
                name: v.name.clone(),
                start: v.start.to_string(),
                end: v.end.to_string(),
            })
            .collect(),
        holidays: cal.holidays.iter().map(|d| d.to_string()).collect(),
    }
}

/// Урок КТП для UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpLessonDto {
    pub id: String,
    pub quarter_id: String,
    pub global_index: i64,
    pub quarter_index: i64,
    pub topic_title: String,
    pub lesson_type: String,
    pub planned_date: Option<String>,
    pub is_cancelled: bool,
    pub objective_codes: Vec<String>,
}

impl From<&crate::domain::ktp::KtpLesson> for KtpLessonDto {
    fn from(l: &crate::domain::ktp::KtpLesson) -> Self {
        Self {
            id: l.id.to_string(),
            quarter_id: l.quarter_id.to_string(),
            global_index: l.global_index,
            quarter_index: l.quarter_index,
            topic_title: l.topic_title.clone(),
            lesson_type: l.lesson_type.as_str().to_string(),
            planned_date: l.planned_date.map(|d| d.to_string()),
            is_cancelled: l.is_cancelled,
            objective_codes: l.objective_codes.clone(),
        }
    }
}

/// Четверть плана для UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpQuarterDto {
    pub id: String,
    pub ktp_id: String,
    pub quarter_number: i64,
    pub hours_per_week: i64,
    pub lessons: Vec<KtpLessonDto>,
}

impl From<&crate::domain::ktp::KtpQuarter> for KtpQuarterDto {
    fn from(q: &crate::domain::ktp::KtpQuarter) -> Self {
        Self {
            id: q.id.to_string(),
            ktp_id: q.ktp_id.to_string(),
            quarter_number: q.quarter_number,
            hours_per_week: q.hours_per_week,
            lessons: q.lessons.iter().map(KtpLessonDto::from).collect(),
        }
    }
}

/// План КТП для UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpPlanDto {
    pub id: String,
    pub subject_id: String,
    pub grade: i64,
    pub academic_year: String,
    pub total_hours: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub days_of_week: String,
    pub quarters: Vec<KtpQuarterDto>,
    pub invariant: InvariantReport,
}

impl From<&KtpPlan> for KtpPlanDto {
    fn from(p: &KtpPlan) -> Self {
        Self {
            id: p.id.to_string(),
            subject_id: p.subject_id.clone(),
            grade: p.grade,
            academic_year: p.academic_year.clone(),
            total_hours: p.total_hours,
            status: p.status.as_str().to_string(),
            created_at: p.created_at.clone(),
            updated_at: p.updated_at.clone(),
            days_of_week: p.days_of_week.clone(),
            quarters: p.quarters.iter().map(KtpQuarterDto::from).collect(),
            invariant: validate_invariants(p),
        }
    }
}

/// Список сохранённых планов КТП (карточки).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpPlanCardDto {
    pub id: String,
    pub subject_id: String,
    pub grade: i64,
    pub academic_year: String,
    pub total_hours: i64,
    pub status: String,
    pub days_of_week: String,
}

/// Список планов КТП.
#[tauri::command]
pub async fn list_ktp_plans(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<KtpPlanCardDto>, String> {
    let rows = db::repo_ktp::list_plans(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| KtpPlanCardDto {
            id: r.id,
            subject_id: r.subject_id,
            grade: r.grade,
            academic_year: r.academic_year,
            total_hours: r.total_hours,
            status: r.status,
            days_of_week: r.days_of_week,
        })
        .collect())
}

/// Генерация плана КТП из полного документа ТУП с последующим сохранением.
#[tauri::command]
pub async fn generate_ktp_from_tup(
    state: tauri::State<'_, AppState>,
    document_id: String,
    grade: i64,
    academic_year: String,
    start_year: i32,
    days_of_week: Vec<u32>,
) -> Result<KtpPlanDto, String> {
    let doc_id = TupDocumentId::from(Uuid::parse_str(&document_id).map_err(|e| e.to_string())?);
    let full = db::repo_tup::get_full_document(&state.pool, doc_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Документ ТУП не найден: {document_id}"))?;

    let subject_id = full.document.subject_id.clone();
    let plan = generate_from_tup(
        &full,
        &GenerateParams {
            subject_id,
            grade,
            academic_year,
            start_year,
            days_of_week: days_of_week.clone(),
        },
    );

    // Авторасчёт дат сразу после генерации.
    let cal = RkCalendar::for_academic_year(start_year);
    let mut plan = plan;
    assign_dates(&mut plan, &cal);

    db::repo_ktp::save_plan(&state.pool, &plan)
        .await
        .map_err(|e| e.to_string())?;

    Ok(KtpPlanDto::from(&plan))
}

/// Обновляет расписание: дни недели + пересчёт физических дат по календарю РК.
#[tauri::command]
pub async fn update_ktp_schedule(
    state: tauri::State<'_, AppState>,
    plan_id: String,
    days_of_week: Vec<u32>,
) -> Result<KtpPlanDto, String> {
    let pid = KtpPlanId::from(Uuid::parse_str(&plan_id).map_err(|e| e.to_string())?);
    let Some(mut plan) = db::repo_ktp::load_plan(&state.pool, pid)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Err(format!("План КТП не найден: {plan_id}"));
    };

    plan.days_of_week = days_of_week
        .iter()
        .map(|d| d.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let start_year = plan.academic_year[..4].parse::<i32>().unwrap_or(2026);
    let cal = RkCalendar::for_academic_year(start_year);
    assign_dates(&mut plan, &cal);

    let dates: Vec<(String, Option<NaiveDate>)> = plan
        .quarters
        .iter()
        .flat_map(|q| q.lessons.iter())
        .map(|l| (l.id.to_string(), l.planned_date))
        .collect();

    db::repo_ktp::update_schedule(&state.pool, pid, &plan.days_of_week, &dates)
        .await
        .map_err(|e| e.to_string())?;

    Ok(KtpPlanDto::from(&plan))
}

/// Валидация инвариантов оценивания плана (FR-2.2, FR-2.3).
#[tauri::command]
pub async fn validate_ktp_invariants(
    state: tauri::State<'_, AppState>,
    plan_id: String,
) -> Result<InvariantReport, String> {
    let pid = KtpPlanId::from(Uuid::parse_str(&plan_id).map_err(|e| e.to_string())?);
    let plan = db::repo_ktp::load_plan(&state.pool, pid)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("План КТП не найден: {plan_id}"))?;
    Ok(validate_invariants(&plan))
}

/// Полный план КТП по id (для загрузки в редактор).
#[tauri::command]
pub async fn get_ktp_plan(
    state: tauri::State<'_, AppState>,
    plan_id: String,
) -> Result<KtpPlanDto, String> {
    let pid = KtpPlanId::from(Uuid::parse_str(&plan_id).map_err(|e| e.to_string())?);
    let plan = db::repo_ktp::load_plan(&state.pool, pid)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("План КТП не найден: {plan_id}"))?;
    Ok(KtpPlanDto::from(&plan))
}

/// Вход редактора: полное дерево плана (после правок).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpPlanSaveIn {
    id: String,
    subject_id: String,
    grade: i64,
    academic_year: String,
    total_hours: i64,
    status: String,
    created_at: String,
    updated_at: String,
    days_of_week: String,
    quarters: Vec<KtpQuarterSaveIn>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpQuarterSaveIn {
    id: String,
    quarter_number: i64,
    hours_per_week: i64,
    lessons: Vec<KtpLessonSaveIn>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KtpLessonSaveIn {
    id: String,
    quarter_id: String,
    global_index: i64,
    quarter_index: i64,
    topic_title: String,
    lesson_type: String,
    planned_date: Option<String>,
    is_cancelled: bool,
    objective_codes: Vec<String>,
}

/// Сохранение плана КТП после правок в редакторе (транзакционная перезапись).
#[tauri::command]
pub async fn save_ktp_plan(
    state: tauri::State<'_, AppState>,
    plan: KtpPlanSaveIn,
) -> Result<KtpPlanDto, String> {
    let pid = KtpPlanId::from(Uuid::parse_str(&plan.id).map_err(|e| e.to_string())?);
    let status = match plan.status.as_str() {
        "Validating" => crate::domain::ktp::KtpStatus::Validating,
        "Approved" => crate::domain::ktp::KtpStatus::Approved,
        "Archived" => crate::domain::ktp::KtpStatus::Archived,
        _ => crate::domain::ktp::KtpStatus::Draft,
    };

    let domain_plan = crate::domain::ktp::KtpPlan {
        id: pid,
        subject_id: plan.subject_id,
        grade: plan.grade,
        academic_year: plan.academic_year,
        total_hours: plan.total_hours,
        status,
        created_at: plan.created_at,
        updated_at: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        days_of_week: plan.days_of_week,
        quarters: plan
            .quarters
            .into_iter()
            .map(|q| {
                let qid = crate::domain::ids::KtpQuarterId::from(
                    Uuid::parse_str(&q.id).unwrap_or_default(),
                );
                crate::domain::ktp::KtpQuarter {
                    id: qid,
                    ktp_id: pid,
                    quarter_number: q.quarter_number,
                    hours_per_week: q.hours_per_week,
                    lessons: q
                        .lessons
                        .into_iter()
                        .map(|l| crate::domain::ktp::KtpLesson {
                            id: crate::domain::ids::KtpLessonId::from(
                                Uuid::parse_str(&l.id).unwrap_or_default(),
                            ),
                            quarter_id: qid,
                            global_index: l.global_index,
                            quarter_index: l.quarter_index,
                            topic_title: l.topic_title,
                            lesson_type: match l.lesson_type.as_str() {
                                "Sor" => crate::domain::invariants::LessonKind::Sor,
                                "Soch" => crate::domain::invariants::LessonKind::Soch,
                                "Revision" => crate::domain::invariants::LessonKind::Revision,
                                _ => crate::domain::invariants::LessonKind::Standard,
                            },
                            planned_date: l
                                .planned_date
                                .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()),
                            is_cancelled: l.is_cancelled,
                            objective_codes: l.objective_codes,
                        })
                        .collect(),
                }
            })
            .collect(),
    };

    db::repo_ktp::replace_plan(&state.pool, &domain_plan)
        .await
        .map_err(|e| e.to_string())?;

    Ok(KtpPlanDto::from(&domain_plan))
}

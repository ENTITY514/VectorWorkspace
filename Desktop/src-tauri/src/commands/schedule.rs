use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;
use crate::db::schedule::{curriculum, fixed_slots, rooms, slots, subjects, teachers};
#[derive(Debug, Serialize)]
pub struct ScheduleStateDto {
    pub teachers: Vec<crate::domain::schedule::model::ScheduleTeacher>,
    pub rooms: Vec<crate::domain::schedule::model::ScheduleRoom>,
    pub classes: Vec<crate::domain::schedule::model::ScheduleClass>,
    pub subgroup_rules: Vec<crate::domain::schedule::model::ScheduleSubgroupRule>,
    pub subjects: Vec<crate::domain::schedule::model::ScheduleSubject>,
    pub curriculum: Vec<crate::domain::schedule::model::ScheduleCurriculum>,
    pub weights: crate::domain::schedule::model::ScheduleWeights,
    pub slots: Vec<crate::domain::schedule::model::ScheduleSlot>,
    pub variants: Vec<crate::domain::schedule::model::ScheduleVariant>,
    pub fixed_slots: Vec<fixed_slots::FixedSlot>,
}

#[tauri::command]
pub async fn schedule_get_state(state: State<'_, AppState>) -> Result<ScheduleStateDto, String> {
    let pool = &state.pool;
    let t = teachers::list_teachers(pool).await.map_err(|e| e.to_string())?;
    let r = rooms::list_rooms(pool).await.map_err(|e| e.to_string())?;
    let subj = subjects::list_subjects(pool).await.map_err(|e| e.to_string())?;
    let curr = curriculum::list_curriculum(pool).await.map_err(|e| e.to_string())?;
    let sr = curriculum::list_subgroup_rules(pool).await.map_err(|e| e.to_string())?;
    let w = slots::get_weights(pool).await.map_err(|e| e.to_string())?;
    let active_vid = slots::get_active_variant_id(pool).await.map_err(|e| e.to_string())?;
    let sl = slots::list_slots_for_variant(pool, &active_vid).await.map_err(|e| e.to_string())?;
    let fs = fixed_slots::list_fixed_slots_for_variant(pool, &active_vid).await.map_err(|e| e.to_string())?;

    // classes
    let classes_rows = sqlx::query_as::<_, (String, i64, String, i64, String, String)>(
        "SELECT id, grade, letter, headcount, shift, class_type FROM schedule_classes ORDER BY grade, letter",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let classes = classes_rows
        .into_iter()
        .map(|(id, grade, letter, headcount, shift, class_type)| crate::domain::schedule::model::ScheduleClass {
            id,
            grade,
            letter,
            headcount,
            shift,
            class_type,
        })
        .collect();

    // variants
    let variant_rows = sqlx::query_as::<_, (String, String, String, i64, i64, bool, String, Option<String>)>(
        "SELECT id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id FROM schedule_variants ORDER BY academic_year DESC, quarter_number DESC, variant_number ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let variants = variant_rows
        .into_iter()
        .map(|(id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id)| crate::domain::schedule::model::ScheduleVariant {
            id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id,
        })
        .collect();

    Ok(ScheduleStateDto {
        teachers: t,
        rooms: r,
        classes,
        subgroup_rules: sr,
        subjects: subj,
        curriculum: curr,
        weights: w,
        slots: sl,
        variants,
        fixed_slots: fs,
    })
}

#[derive(Debug, Deserialize)]
pub struct UpsertTeacherInput {
    pub id: Option<String>,
    pub full_name: String,
    pub base_room_id: Option<String>,
    pub max_daily_lessons: i64,
    pub availability_json: String,
    pub subject_ids: Option<String>,
    pub is_combined: Option<bool>,
}

#[tauri::command]
pub async fn schedule_upsert_teacher(state: State<'_, AppState>, input: UpsertTeacherInput) -> Result<crate::domain::schedule::model::ScheduleTeacher, String> {
    teachers::upsert_teacher(
        &state.pool,
        input.id,
        input.full_name,
        input.base_room_id,
        input.max_daily_lessons,
        input.availability_json,
        input.subject_ids.unwrap_or_else(|| "[]".to_string()),
        input.is_combined.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_delete_teacher(state: State<'_, AppState>, id: String) -> Result<(), String> {
    teachers::delete_teacher(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpsertRoomInput {
    pub id: Option<String>,
    pub name: String,
    pub room_type: String,
    pub capacity: i64,
    pub base_teacher_id: Option<String>,
    pub floor: Option<i64>,
}

#[tauri::command]
pub async fn schedule_upsert_room(state: State<'_, AppState>, input: UpsertRoomInput) -> Result<crate::domain::schedule::model::ScheduleRoom, String> {
    rooms::upsert_room(
        &state.pool,
        input.id,
        input.name,
        input.room_type,
        input.capacity,
        input.base_teacher_id,
        input.floor,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_delete_room(state: State<'_, AppState>, id: String) -> Result<(), String> {
    rooms::delete_room(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpsertClassInput {
    pub id: Option<String>,
    pub grade: i64,
    pub letter: String,
    pub headcount: i64,
    pub shift: String,
    pub class_type: Option<String>,
}

#[tauri::command]
pub async fn schedule_upsert_class(state: State<'_, AppState>, input: UpsertClassInput) -> Result<crate::domain::schedule::model::ScheduleClass, String> {
    crate::domain::schedule::validation::validate_grade(input.grade).map_err(|e| e.to_string())?;
    crate::domain::schedule::validation::validate_headcount(input.headcount).map_err(|e| e.to_string())?;
    crate::domain::schedule::validation::validate_name(&input.letter).map_err(|e| e.to_string())?;
    if crate::domain::schedule::model::Shift::from_str(&input.shift).is_none() {
        return Err(format!("unknown shift: {}", input.shift));
    }
    let cid = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let class_type = input.class_type.unwrap_or_else(|| "normal".to_string());
    if !["normal","do","luo"].contains(&class_type.as_str()) {
        return Err(format!("unknown class_type: {}", class_type));
    }
    sqlx::query(
        "INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET grade=?2, letter=?3, headcount=?4, shift=?5, class_type=?6",
    )
    .bind(&cid)
    .bind(input.grade)
    .bind(&input.letter)
    .bind(input.headcount)
    .bind(&input.shift)
    .bind(&class_type)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(crate::domain::schedule::model::ScheduleClass {
        id: cid,
        grade: input.grade,
        letter: input.letter,
        headcount: input.headcount,
        shift: input.shift,
        class_type,
    })
}

#[tauri::command]
pub async fn schedule_delete_class(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM schedule_classes WHERE id=?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct UpsertSubjectInput {
    pub id: String,
    pub name: String,
    pub sanitary_weight: i64,
    pub required_room_type: Option<String>,
    pub requires_split: bool,
    pub is_double_allowed: bool,
    pub related_subjects_json: String,
}

#[tauri::command]
pub async fn schedule_upsert_subject(state: State<'_, AppState>, input: UpsertSubjectInput) -> Result<crate::domain::schedule::model::ScheduleSubject, String> {
    subjects::upsert_subject(
        &state.pool,
        input.id,
        input.name,
        input.sanitary_weight,
        input.required_room_type,
        input.requires_split,
        input.is_double_allowed,
        input.related_subjects_json,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_delete_subject(state: State<'_, AppState>, id: String) -> Result<(), String> {
    subjects::delete_subject(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpsertSubgroupRuleInput {
    pub class_id: String,
    pub subject_id: String,
    pub group_count: i64,
}

#[tauri::command]
pub async fn schedule_upsert_subgroup_rule(state: State<'_, AppState>, input: UpsertSubgroupRuleInput) -> Result<String, String> {
    subjects::upsert_subgroup_rule(&state.pool, input.class_id, input.subject_id, input.group_count)
        .await
        .map_err(|e| e.to_string())?;
    Ok("ok".to_string())
}

#[derive(Debug, Deserialize)]
pub struct CurriculumEntryInput {
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub split_teacher2_id: Option<String>,
    pub hours_per_week: i64,
    pub joint_lesson_id: Option<String>,
}

#[tauri::command]
pub async fn schedule_set_curriculum(state: State<'_, AppState>, entries: Vec<CurriculumEntryInput>) -> Result<Vec<crate::domain::schedule::model::ScheduleCurriculum>, String> {
    let tuples = entries
        .into_iter()
        .map(|e| (e.class_id, e.subject_id, e.teacher_id, e.split_teacher2_id, e.hours_per_week, e.joint_lesson_id))
        .collect();
    curriculum::set_curriculum_entries(&state.pool, tuples)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_toggle_joint_lessons(
    state: State<'_, AppState>,
    curriculum_ids: Vec<String>,
    joint_lesson_id: Option<String>,
) -> Result<Vec<crate::domain::schedule::model::ScheduleCurriculum>, String> {
    curriculum::toggle_joint_lessons(&state.pool, curriculum_ids, joint_lesson_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct SetWeightsInput {
    pub window: i64,
    pub room_displacement: i64,
    pub sanpin_parabola: i64,
    pub alternation: i64,
    pub movement: i64,
    pub load_balance: i64,
    pub change_slot: i64,
}

#[tauri::command]
pub async fn schedule_set_weights(state: State<'_, AppState>, input: SetWeightsInput) -> Result<crate::domain::schedule::model::ScheduleWeights, String> {
    slots::set_weights(
        &state.pool,
        input.window,
        input.room_displacement,
        input.sanpin_parabola,
        input.alternation,
        input.movement,
        input.load_balance,
        input.change_slot,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_clear_slots(state: State<'_, AppState>, variant_id: Option<String>) -> Result<(), String> {
    let vid = match variant_id {
        Some(v) => v,
        None => slots::get_active_variant_id(&state.pool).await.map_err(|e| e.to_string())?,
    };
    slots::clear_slots(&state.pool, &vid).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_get_slots(state: State<'_, AppState>) -> Result<Vec<crate::domain::schedule::model::ScheduleSlot>, String> {
    let vid = slots::get_active_variant_id(&state.pool).await.map_err(|e| e.to_string())?;
    slots::list_slots_for_variant(&state.pool, &vid).await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct GenerateInput {
    pub time_limit_sec: Option<i64>,
    pub num_workers: Option<i64>,
    pub seed: Option<i64>,
}

#[tauri::command]
pub async fn schedule_generate<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: State<'_, AppState>, input: Option<GenerateInput>) -> Result<serde_json::Value, String> {
    let pool = &state.pool;

    let params = crate::domain::schedule::generation_service::GenerationParams {
        time_limit_sec: input.as_ref().and_then(|i| i.time_limit_sec).unwrap_or(60),
        num_workers: input.as_ref().and_then(|i| i.num_workers).unwrap_or(8),
        seed: input.as_ref().and_then(|i| i.seed).unwrap_or(42),
    };

    // Контракт собирается ЕДИНСТВЕННОЙ функцией: команда, тест и CLI обязаны
    // идти одним путём, иначе расхождение UI и скриптов воспроизведётся.
    let built = crate::domain::schedule::generation_service::build_solver_input(pool, &params)
        .await
        .map_err(|e| e.to_string())?;

    // ─── Pre-Solver Shield: математическая проверка до вызова Python ───
    let teachers_db = teachers::list_teachers(pool).await.map_err(|e| e.to_string())?;
    let rooms_db = rooms::list_rooms(pool).await.map_err(|e| e.to_string())?;
    let subjects_db = subjects::list_subjects(pool).await.map_err(|e| e.to_string())?;
    let curriculum_db = curriculum::list_curriculum(pool).await.map_err(|e| e.to_string())?;
    let pre_result = crate::domain::schedule::pre_validate::pre_validate_all(
        &teachers_db,
        &subjects_db,
        &rooms_db,
        &curriculum_db,
        built.grid.days as usize,
        built.grid.periods_per_day as usize,
    );
    if !pre_result.is_ok() {
        return Ok(serde_json::json!({
            "schema_version": crate::infra::solver_host::SCHEMA_VERSION,
            "status": "INFEASIBLE",
            "solver_stats": { "wall_ms": 0, "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0 },
            "penalties": { "window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0, "total": 0 },
            "slots": [],
            "diagnostics": {
                "infeasible_core": {
                    "reason": pre_result.errors.join("; "),
                    "conflicting_entities": [],
                    "suggestion": "Измените расписание учителя, добавьте кабинеты или скорректируйте нагрузку"
                },
                "warnings": []
            }
        }));
    }

    let input_json = built.json;

    // вызвать солвер
    let solver_script = crate::infra::resource_paths::solver_script(&app).map_err(|e| e.to_string())?;
    let python_bin = crate::infra::solver_host::SolverHost::default_python();
    let host = crate::infra::solver_host::SolverHost::new(python_bin, solver_script);
    let output = host.run(input_json).await.map_err(|e| e.to_string())?;

    // при OPTIMAL/FEASIBLE — валидировать и коммитить в активный вариант
    if output.status == "OPTIMAL" || output.status == "FEASIBLE" {
        crate::infra::solver_host::SolverHost::validate_hard(&output.slots)
            .map_err(|e| e.to_string())?;
        crate::domain::schedule::generation_service::commit_slots(
            pool,
            &built.variant_id,
            &output.slots,
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    serde_json::to_value(&output).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_export(state: State<'_, AppState>, format: Option<String>) -> Result<String, String> {
    let pool = &state.pool;
    let vid = slots::get_active_variant_id(pool).await.map_err(|e| e.to_string())?;
    let slots = slots::list_slots_for_variant(pool, &vid).await.map_err(|e| e.to_string())?;
    let fmt = format.as_deref().unwrap_or("csv");
    if fmt == "json" {
        return serde_json::to_string(&slots).map_err(|e| e.to_string());
    }
    if fmt == "xlsx" {
        let classes = sqlx::query_as::<_, (String, i64, String)>("SELECT id, grade, letter FROM schedule_classes")
            .fetch_all(pool).await.map_err(|e| e.to_string())?;
        let subjects = sqlx::query_as::<_, (String, String)>("SELECT id, name FROM schedule_subjects")
            .fetch_all(pool).await.map_err(|e| e.to_string())?;
        let teachers = sqlx::query_as::<_, (String, String)>("SELECT id, full_name FROM schedule_teachers")
            .fetch_all(pool).await.map_err(|e| e.to_string())?;
        let rooms = sqlx::query_as::<_, (String, String)>("SELECT id, name FROM schedule_rooms")
            .fetch_all(pool).await.map_err(|e| e.to_string())?;
        let export_classes: Vec<crate::infra::schedule_export::ScheduleExportClass> = classes.into_iter().map(|(id, grade, letter)| crate::infra::schedule_export::ScheduleExportClass { id, grade, letter }).collect();
        let export_subjects: Vec<crate::infra::schedule_export::ScheduleExportSubject> = subjects.into_iter().map(|(id, name)| crate::infra::schedule_export::ScheduleExportSubject { id, name }).collect();
        let export_teachers: Vec<crate::infra::schedule_export::ScheduleExportTeacher> = teachers.into_iter().map(|(id, full_name)| crate::infra::schedule_export::ScheduleExportTeacher { id, full_name }).collect();
        let export_rooms: Vec<crate::infra::schedule_export::ScheduleExportRoom> = rooms.into_iter().map(|(id, name)| crate::infra::schedule_export::ScheduleExportRoom { id, name }).collect();
        let export_slots: Vec<crate::infra::schedule_export::ScheduleExportSlot> = slots.iter().map(|s| crate::infra::schedule_export::ScheduleExportSlot {
            class_id: s.class_id.clone(),
            subject_id: s.subject_id.clone(),
            teacher_id: s.teacher_id.clone(),
            room_id: s.room_id.clone(),
            day: s.day,
            period: s.period,
        }).collect();
        let bytes = crate::infra::schedule_export::generate_xlsx(
            &export_classes,
            &export_subjects,
            &export_teachers,
            &export_rooms,
            &export_slots,
        );
        use base64::Engine as _;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Ok(format!("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{encoded}"));
    }
    let mut out = String::from("class_id,subject_id,teacher_id,room_id,subgroup_label,day,period\n");
    for s in &slots {
        let label = s.subgroup_label.clone().unwrap_or_default();
        out.push_str(&format!("{},{},{},{},{},{},{}\n", s.class_id, s.subject_id, s.teacher_id, s.room_id, label, s.day, s.period));
    }
    Ok(out)
}

#[tauri::command]
pub async fn schedule_import_legacy<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: State<'_, AppState>, quarter: Option<i64>) -> Result<serde_json::Value, String> {
    let q = quarter.unwrap_or(4);
    if !(1..=4).contains(&q) {
        return Err("quarter must be 1..4".to_string());
    }
    let base = crate::infra::resource_paths::seed_data_dir(&app).map_err(|e| e.to_string())?;
    let catalog_path = base.join("catalog.json");
    let curriculum_path = base.join(format!("curriculum_q{}.json", q));
    let catalog_str = std::fs::read_to_string(&catalog_path).map_err(|e| format!("read catalog.json: {}", e))?;
    let curriculum_str = std::fs::read_to_string(&curriculum_path).map_err(|e| format!("read curriculum_q{}.json: {}", q, e))?;
    let catalog: serde_json::Value = serde_json::from_str(&catalog_str).map_err(|e| e.to_string())?;
    let curriculum: Vec<serde_json::Value> = serde_json::from_str(&curriculum_str).map_err(|e| e.to_string())?;

    let pool = &state.pool;

    // 1) Создаём/получаем вариант 2025-2026 / Q{q} / V1 (деактивируем остальные)
    let variant_id = {
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id FROM schedule_variants WHERE academic_year='2025-2026' AND quarter_number=?1 AND variant_number=1",
        )
        .bind(q)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
        match existing {
            Some(vid) => {
                sqlx::query("UPDATE schedule_variants SET is_active=0 WHERE id != ?1")
                    .bind(&vid).execute(pool).await.map_err(|e| e.to_string())?;
                sqlx::query("UPDATE schedule_variants SET is_active=1 WHERE id=?1")
                    .bind(&vid).execute(pool).await.map_err(|e| e.to_string())?;
                vid
            }
            None => {
                let vid = uuid::Uuid::new_v4().to_string();
                sqlx::query("UPDATE schedule_variants SET is_active=0").execute(pool).await.map_err(|e| e.to_string())?;
                sqlx::query(
                    "INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number, is_active, created_at)
                     VALUES (?1, ?2, '2025-2026', ?3, 1, 1, datetime('now'))",
                )
                .bind(&vid)
                .bind(format!("{} четверть, Вариант 1", q))
                .bind(q)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
                vid
            }
        }
    };

    // Собираем mapping teacher -> subjects из curriculum
    let mut teacher_subjects: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for e in &curriculum {
        let teacher_id = e.get("teacher_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let subject_id = e.get("subject_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !teacher_id.is_empty() && !subject_id.is_empty() {
            teacher_subjects.entry(teacher_id).or_default().push(subject_id);
        }
    }
    for subjects in teacher_subjects.values_mut() {
        subjects.sort();
        subjects.dedup();
    }

    // 2) Учителя
    if let Some(teachers) = catalog.get("teachers").and_then(|v| v.as_array()) {
        for t in teachers {
            let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let full_name = t.get("display_name").or_else(|| t.get("full_name")).and_then(|v| v.as_str()).unwrap_or(&id).to_string();
            let avail = t.get("availability_json").and_then(|v| v.as_str()).unwrap_or("[[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true]]").to_string();
            let avail_str = if avail.starts_with('[') { avail } else { format!("\"{}\"", avail) };
            let avail_json = if serde_json::from_str::<serde_json::Value>(&avail_str).is_ok() { avail_str } else { "[[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true]]".to_string() };
            let subject_ids = teacher_subjects.get(&id)
                .map(|s| serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string()))
                .unwrap_or_else(|| "[]".to_string());
            let _ = teachers::upsert_teacher(pool, Some(id), full_name, None, 0, avail_json, subject_ids, false).await.map_err(|e| e.to_string())?;
        }
    }

    // 3) Кабинеты — INSERT OR IGNORE чтобы не падать на дубликате имени
    if let Some(rooms) = catalog.get("rooms").and_then(|v| v.as_array()) {
        for r in rooms {
            let id = r.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = r.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
            let room_type = r.get("room_type").and_then(|v| v.as_str()).unwrap_or("General").to_string();
            let capacity = r.get("capacity").and_then(|v| v.as_i64()).unwrap_or(30);
            let _ = sqlx::query(
                "INSERT OR IGNORE INTO schedule_rooms (id, name, room_type, capacity) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(&id).bind(&name).bind(&room_type).bind(capacity)
            .execute(pool).await.map_err(|e| e.to_string())?;
        }
    }

    // 4) Классы
    if let Some(classes) = catalog.get("classes").and_then(|v| v.as_array()) {
        for c in classes {
            let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let grade = c.get("grade").and_then(|v| v.as_i64()).unwrap_or(1);
            let letter = c.get("letter").and_then(|v| v.as_str()).unwrap_or("А").to_string();
            let headcount = c.get("headcount").and_then(|v| v.as_i64()).unwrap_or(25);
            let shift = c.get("shift").and_then(|v| v.as_str()).unwrap_or("First").to_string();
            let class_type = c.get("type").or_else(|| c.get("class_type")).and_then(|v| v.as_str()).unwrap_or("normal").to_string();
            let ct = if ["normal","do","luo"].contains(&class_type.as_str()) { class_type } else { "normal".to_string() };
            let _ = sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET grade=?2, letter=?3, headcount=?4, shift=?5, class_type=?6")
                .bind(&id).bind(grade).bind(&letter).bind(headcount).bind(&shift).bind(&ct)
                .execute(pool).await.map_err(|e| e.to_string())?;
        }
    }

    // 5) Предметы
    if let Some(subjects) = catalog.get("subjects").and_then(|v| v.as_array()) {
        for s in subjects {
            let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = s.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
            let weight = s.get("sanitary_weight").and_then(|v| v.as_i64()).unwrap_or(5);
            let room_type = s.get("required_room_type").and_then(|v| v.as_str().map(|s| s.to_string()));
            let rt = match room_type.as_deref() {
                Some("General") | Some("ChemistryLab") | Some("PhysicsLab") | Some("BiologyLab") | Some("Informatics") | Some("LanguageLab") | Some("Gym") | Some("Workshop") => room_type,
                _ => None,
            };
            let _ = subjects::upsert_subject(pool, id, name, weight, rt, false, false, "[]".to_string()).await.map_err(|e| e.to_string())?;
        }
    }

    // 6) Нагрузка
    let mut entries: Vec<(String, String, String, Option<String>, i64, Option<String>)> = Vec::new();
    for e in &curriculum {
        let class_id = e.get("class_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let subject_id = e.get("subject_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let teacher_id = e.get("teacher_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let split2 = e.get("split_teacher2_id").and_then(|v| v.as_str().map(|s| s.to_string()));
        let hours = e.get("hours_per_week").and_then(|v| v.as_i64()).unwrap_or(1);
        if class_id.is_empty() || subject_id.is_empty() || teacher_id.is_empty() { continue; }
        entries.push((class_id, subject_id, teacher_id, split2, hours, None));
    }
    curriculum::set_curriculum_entries(pool, entries).await.map_err(|e| e.to_string())?;

    // 7) Слоты расписания — в выбранный вариант
    // Для Q4 2025-2026 используем детализированные варианты из Materials/Q4 Schedule 2026
    let q4_v1_path = base.join("schedule_q4_2026_variant1.json");
    let q4_v2_path = base.join("schedule_q4_2026_variant2.json");
    let q4_v3_path = base.join("schedule_q4_2026_variant3.json");
    let legacy_path = base.join(format!("schedule_legacy_q{}.json", q));

    if q == 4 && q4_v1_path.exists() {
        // Q4: импортируем два варианта 2025-2026/Q4/V1 и V2
        let v1_str = std::fs::read_to_string(&q4_v1_path).map_err(|e| format!("read q4 variant1: {}", e))?;
        let v1_slots: Vec<serde_json::Value> = serde_json::from_str(&v1_str).map_err(|e| e.to_string())?;
        // Переименовываем вариант 1 для ясного отображения
        sqlx::query("UPDATE schedule_variants SET name = '4 четверть, Вариант 1 (Ручной / XLS)' WHERE id = ?1")
            .bind(&variant_id).execute(pool).await.ok();

        // Вставляем слоты V1
        sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1").bind(&variant_id).execute(pool).await.map_err(|e| e.to_string())?;
        for v in &v1_slots {
            let class_id = v.get("class_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let subject_id = v.get("subject_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let teacher_id = v.get("teacher_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let room_id = v.get("room_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let day = v.get("day").and_then(|x| x.as_i64()).unwrap_or(0);
            let period = v.get("period").and_then(|x| x.as_i64()).unwrap_or(0);
            let subgroup = v.get("subgroup_label").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let joint_id = v.get("joint_lesson_id").and_then(|x| x.as_str().map(|s| s.to_string()));
            let slot_id = if subgroup.is_empty() { format!("q4v1_{}_{}_{}_{}", class_id, day, period, teacher_id) } else { format!("q4v1_{}_{}_{}_{}_{}", class_id, day, period, teacher_id, &subgroup) };
            let _ = sqlx::query(
                "INSERT OR IGNORE INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)",
            )
            .bind(&slot_id)
            .bind(&class_id)
            .bind(&subject_id)
            .bind(&teacher_id)
            .bind(&room_id)
            .bind(&subgroup)
            .bind(day)
            .bind(period)
            .bind(&variant_id)
            .bind(&joint_id)
            .execute(pool).await;
        }

        // Создаём/получаем вариант 2
        let variant2_id = {
            let existing: Option<String> = sqlx::query_scalar(
                "SELECT id FROM schedule_variants WHERE academic_year='2025-2026' AND quarter_number=4 AND variant_number=2",
            )
            .fetch_optional(pool).await.map_err(|e| e.to_string())?;
            match existing {
                Some(vid) => {
                    sqlx::query("UPDATE schedule_variants SET name = '4 четверть, Вариант 2 (Жадный алгоритм)' WHERE id = ?1").bind(&vid).execute(pool).await.ok();
                    vid
                },
                None => {
                    let vid = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id)
                         VALUES (?1, '4 четверть, Вариант 2 (Жадный алгоритм)', '2025-2026', 4, 2, 0, datetime('now'), ?2)",
                    )
                    .bind(&vid)
                    .bind(&variant_id)
                    .execute(pool).await.map_err(|e| e.to_string())?;
                    vid
                }
            }
        };
        if q4_v2_path.exists() {
            let v2_str = std::fs::read_to_string(&q4_v2_path).map_err(|e| format!("read q4 variant2: {}", e))?;
            let v2_slots: Vec<serde_json::Value> = serde_json::from_str(&v2_str).map_err(|e| e.to_string())?;
            sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1").bind(&variant2_id).execute(pool).await.map_err(|e| e.to_string())?;
            for v in &v2_slots {
                let class_id = v.get("class_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let subject_id = v.get("subject_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let teacher_id = v.get("teacher_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let room_id = v.get("room_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let day = v.get("day").and_then(|x| x.as_i64()).unwrap_or(0);
                let period = v.get("period").and_then(|x| x.as_i64()).unwrap_or(0);
                let subgroup = v.get("subgroup_label").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let joint_id = v.get("joint_lesson_id").and_then(|x| x.as_str().map(|s| s.to_string()));
                let slot_id = if subgroup.is_empty() { format!("q4v2_{}_{}_{}_{}", class_id, day, period, teacher_id) } else { format!("q4v2_{}_{}_{}_{}_{}", class_id, day, period, teacher_id, &subgroup) };
                let _ = sqlx::query(
                    "INSERT OR IGNORE INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)",
                )
                .bind(&slot_id)
                .bind(&class_id)
                .bind(&subject_id)
                .bind(&teacher_id)
                .bind(&room_id)
                .bind(&subgroup)
                .bind(day)
                .bind(period)
                .bind(&variant2_id)
                .bind(&joint_id)
                .execute(pool).await;
            }
        } else {
            // Fallback: копируем V1 как V2
            sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1").bind(&variant2_id).execute(pool).await.map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT OR IGNORE INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
                 SELECT 'q4v2_' || id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, ?1, joint_lesson_id
                 FROM schedule_slots WHERE variant_id = ?2",
            )
            .bind(&variant2_id)
            .bind(&variant_id)
            .execute(pool).await.map_err(|e| e.to_string())?;
        }

        // Создаём/получаем вариант 3 (CP-SAT Умная генерация)
        let variant3_id = {
            let existing: Option<String> = sqlx::query_scalar(
                "SELECT id FROM schedule_variants WHERE academic_year='2025-2026' AND quarter_number=4 AND variant_number=3",
            )
            .fetch_optional(pool).await.map_err(|e| e.to_string())?;
            match existing {
                Some(vid) => {
                    sqlx::query("UPDATE schedule_variants SET name = '4 четверть, Вариант 3 (Умный алгоритм CP-SAT)' WHERE id = ?1").bind(&vid).execute(pool).await.ok();
                    vid
                },
                None => {
                    let vid = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id)
                         VALUES (?1, '4 четверть, Вариант 3 (Умный алгоритм CP-SAT)', '2025-2026', 4, 3, 0, datetime('now'), ?2)",
                    )
                    .bind(&vid)
                    .bind(&variant_id)
                    .execute(pool).await.map_err(|e| e.to_string())?;
                    vid
                }
            }
        };
        if q4_v3_path.exists() {
            let v3_str = std::fs::read_to_string(&q4_v3_path).map_err(|e| format!("read q4 variant3: {}", e))?;
            let v3_slots: Vec<serde_json::Value> = serde_json::from_str(&v3_str).map_err(|e| e.to_string())?;
            sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1").bind(&variant3_id).execute(pool).await.map_err(|e| e.to_string())?;
            for v in &v3_slots {
                let class_id = v.get("class_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let subject_id = v.get("subject_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let teacher_id = v.get("teacher_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let room_id = v.get("room_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let day = v.get("day").and_then(|x| x.as_i64()).unwrap_or(0);
                let period = v.get("period").and_then(|x| x.as_i64()).unwrap_or(0);
                let subgroup = v.get("subgroup_label").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let joint_id = v.get("joint_lesson_id").and_then(|x| x.as_str().map(|s| s.to_string()));
                let slot_id = if subgroup.is_empty() { format!("q4v3_{}_{}_{}_{}", class_id, day, period, teacher_id) } else { format!("q4v3_{}_{}_{}_{}_{}", class_id, day, period, teacher_id, &subgroup) };
                let _ = sqlx::query(
                    "INSERT OR IGNORE INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)",
                )
                .bind(&slot_id)
                .bind(&class_id)
                .bind(&subject_id)
                .bind(&teacher_id)
                .bind(&room_id)
                .bind(&subgroup)
                .bind(day)
                .bind(period)
                .bind(&variant3_id)
                .bind(&joint_id)
                .execute(pool).await;
            }
        }

        Ok(serde_json::json!({
            "quarter": q,
            "variant_id": variant_id,
            "variant2_id": variant2_id,
            "variant3_id": variant3_id,
            "imported": true,
            "catalog_counts": {
                "teachers": catalog.get("teachers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "subjects": catalog.get("subjects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "rooms": catalog.get("rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "classes": catalog.get("classes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            },
            "q4_variants": {
                "v1_slots": v1_slots.len(),
                "v2_exists": true,
                "v3_exists": q4_v3_path.exists()
            }
        }))
    } else if legacy_path.exists() {
        let legacy_str = std::fs::read_to_string(&legacy_path).map_err(|e| format!("read legacy: {}", e))?;
        let legacy: Vec<serde_json::Value> = serde_json::from_str(&legacy_str).map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1 AND id LIKE 'legacy_%'")
            .bind(&variant_id)
            .execute(pool).await.map_err(|e| e.to_string())?;
        for v in &legacy {
            let class_id = v.get("class_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let subject_id = v.get("subject_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let teacher_id = v.get("teacher_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let room_id = v.get("room_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let day = v.get("day").and_then(|x| x.as_i64()).unwrap_or(0);
            let period = v.get("period").and_then(|x| x.as_i64()).unwrap_or(0);
            let slot_id = format!("legacy_{}_{}_{}_{}_{}", class_id, v.get("week").and_then(|x| x.as_i64()).unwrap_or(1), day, period, teacher_id);
            let _ = sqlx::query(
                "INSERT OR IGNORE INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7, 0, ?8)",
            )
            .bind(&slot_id)
            .bind(&class_id)
            .bind(&subject_id)
            .bind(&teacher_id)
            .bind(&room_id)
            .bind(day)
            .bind(period)
            .bind(&variant_id)
            .execute(pool).await;
        }
        Ok(serde_json::json!({
            "quarter": q,
            "variant_id": variant_id,
            "imported": true,
            "catalog_counts": {
                "teachers": catalog.get("teachers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "subjects": catalog.get("subjects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "rooms": catalog.get("rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "classes": catalog.get("classes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            }
        }))
    } else {
        Ok(serde_json::json!({
            "quarter": q,
            "variant_id": variant_id,
            "imported": true,
            "catalog_counts": {
                "teachers": catalog.get("teachers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "subjects": catalog.get("subjects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "rooms": catalog.get("rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "classes": catalog.get("classes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            }
        }))
    }
}

#[tauri::command]
pub async fn schedule_get_legacy<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: State<'_, AppState>, quarter: i64) -> Result<Vec<crate::domain::schedule::model::ScheduleSlot>, String> {
    if !(1..=4).contains(&quarter) {
        return Err("quarter must be 1..4".to_string());
    }
    let base = crate::infra::resource_paths::seed_data_dir(&app).map_err(|e| e.to_string())?;
    let path = base.join(format!("schedule_legacy_q{}.json", quarter));
    let s = std::fs::read_to_string(&path).map_err(|e| format!("read legacy_q{}.json: {}", quarter, e))?;
    let arr: Vec<serde_json::Value> = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for v in arr {
        let class_id = v.get("class_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let subject_id = v.get("subject_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let teacher_id = v.get("teacher_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let room_id = v.get("room_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let day = v.get("day").and_then(|x| x.as_i64()).unwrap_or(0);
        let period = v.get("period").and_then(|x| x.as_i64()).unwrap_or(0);
        out.push(crate::domain::schedule::model::ScheduleSlot{
            id: format!("legacy_{}_{}_{}_{}", class_id, v.get("week").and_then(|x| x.as_i64()).unwrap_or(1), day, period),
            class_id,
            subject_id,
            teacher_id,
            room_id,
            subgroup_label: None,
            day,
            period,
            is_double: false,
            joint_lesson_id: None,
            week: v.get("week").and_then(|x| x.as_i64()),
            source_subject: v.get("source_subject").and_then(|x| x.as_str()).map(str::to_string),
            source_teacher: v.get("source_teacher").and_then(|x| x.as_str()).map(str::to_string),
            source_time: v.get("source_time").and_then(|x| x.as_str()).map(str::to_string),
            source_note: v.get("source_note").and_then(|x| x.as_str()).map(str::to_string),
            variant_id: Some("default".to_string()),
        });
    }
    let _ = &state;
    Ok(out)
}

// ============================================================
// Варианты расписания
// ============================================================

#[tauri::command]
pub async fn schedule_list_variants(state: State<'_, AppState>) -> Result<Vec<crate::domain::schedule::model::ScheduleVariant>, String> {
    let rows = sqlx::query_as::<_, (String, String, String, i64, i64, bool, String, Option<String>)>(
        "SELECT id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id FROM schedule_variants ORDER BY academic_year DESC, quarter_number DESC, variant_number ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id)| {
        crate::domain::schedule::model::ScheduleVariant { id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id }
    }).collect())
}

#[derive(Debug, Deserialize)]
pub struct CreateVariantInput {
    pub name: String,
    pub academic_year: String,
    pub quarter_number: Option<i64>,
    pub variant_number: Option<i64>,
    pub copy_from_variant_id: Option<String>,
}

#[tauri::command]
pub async fn schedule_create_variant(state: State<'_, AppState>, input: CreateVariantInput) -> Result<crate::domain::schedule::model::ScheduleVariant, String> {
    let vid = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let qn = input.quarter_number.unwrap_or(0);
    let vn = input.variant_number.unwrap_or(1);

    // Если указан copy_from — копируем слоты из этого варианта
    if let Some(ref copy_id) = input.copy_from_variant_id {
        sqlx::query(
            "INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id)
             SELECT ?1 || '_' || id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, ?2
             FROM schedule_slots WHERE variant_id = ?3",
        )
        .bind(&vid)
        .bind(&vid)
        .bind(copy_id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO schedule_variants (id, name, academic_year, quarter_number, variant_number, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)",
    )
    .bind(&vid)
    .bind(&input.name)
    .bind(&input.academic_year)
    .bind(qn)
    .bind(vn)
    .bind(&now)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(crate::domain::schedule::model::ScheduleVariant {
        id: vid,
        name: input.name,
        academic_year: input.academic_year,
        quarter_number: qn,
        variant_number: vn,
        is_active: false,
        created_at: now,
        parent_variant_id: input.copy_from_variant_id,
    })
}

#[tauri::command]
pub async fn schedule_set_active_variant(state: State<'_, AppState>, variant_id: String) -> Result<(), String> {
    sqlx::query("UPDATE schedule_variants SET is_active = CASE WHEN id = ?1 THEN 1 ELSE 0 END")
        .bind(&variant_id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn schedule_delete_variant(state: State<'_, AppState>, variant_id: String) -> Result<(), String> {
    if variant_id == "default" {
        return Err("Нельзя удалить основной вариант".to_string());
    }
    let pool = &state.pool;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    // Дочерние варианты разрываем (parent_variant_id -> NULL)
    sqlx::query("UPDATE schedule_variants SET parent_variant_id = NULL WHERE parent_variant_id = ?1")
        .bind(&variant_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    // Удаляем слоты варианта, затем сам вариант
    sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1")
        .bind(&variant_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM schedule_variants WHERE id = ?1")
        .bind(&variant_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Портирование настроек из исходной четверти в целевую.
/// Deep clone: учителя и классы (с новыми ID и quarter_number=to_q).
/// Кабинеты и предметы — глобальные, не копируются. Варианты/слоты/фикс. слоты не копируются.
#[tauri::command]
pub async fn schedule_port_quarter(
    state: State<'_, AppState>,
    from_quarter: i64,
    to_quarter: i64,
) -> Result<serde_json::Value, String> {
    let (cloned_teachers, cloned_classes) =
        crate::db::schedule::porting::port_quarter(&state.pool, from_quarter, to_quarter)
            .await
            .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "cloned_teachers": cloned_teachers,
        "cloned_classes": cloned_classes,
    }))
}

#[tauri::command]
pub async fn schedule_get_slots_for_variant(state: State<'_, AppState>, variant_id: String) -> Result<Vec<crate::domain::schedule::model::ScheduleSlot>, String> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, bool, Option<String>)>(
        "SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id FROM schedule_slots WHERE variant_id = ?1 ORDER BY day, period",
    )
    .bind(&variant_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id)| {
        crate::domain::schedule::model::ScheduleSlot {
            id, class_id, subject_id, teacher_id, room_id,
            subgroup_label: if subgroup_label.is_empty() { None } else { Some(subgroup_label) },
            day, period, is_double, joint_lesson_id: None, week: None,
            source_subject: None, source_teacher: None, source_time: None, source_note: None,
            variant_id,
        }
    }).collect())
}

// ===== Fixed Slots (Pinned Lessons) =====

#[derive(serde::Deserialize)]
pub struct PinSlotInput {
    pub variant_id: String,
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub room_id: String,
    pub day: i64,
    pub period: i64,
    pub subgroup_label: Option<String>,
    /// Закрепление совмещённого урока: без этого поля частичный уникальный
    /// индекс из миграции 0020 отвергнет второй класс класс-комплекта.
    #[serde(default)]
    pub joint_lesson_id: Option<String>,
}

#[tauri::command]
pub async fn schedule_pin_slot(
    state: State<'_, AppState>,
    input: PinSlotInput,
) -> Result<crate::db::schedule::fixed_slots::FixedSlot, String> {
    let id = uuid::Uuid::new_v4().to_string();
    crate::db::schedule::fixed_slots::insert_fixed_slot(
        &state.pool,
        &id,
        &input.variant_id,
        &input.class_id,
        &input.subject_id,
        &input.teacher_id,
        &input.room_id,
        input.day,
        input.period,
        input.subgroup_label.as_deref(),
        input.joint_lesson_id.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_unpin_slot(
    state: State<'_, AppState>,
    slot_id: String,
) -> Result<(), String> {
    crate::db::schedule::fixed_slots::delete_fixed_slot(&state.pool, &slot_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_get_fixed_slots(
    state: State<'_, AppState>,
    variant_id: String,
) -> Result<Vec<crate::db::schedule::fixed_slots::FixedSlot>, String> {
    crate::db::schedule::fixed_slots::list_fixed_slots_for_variant(&state.pool, &variant_id)
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────
// Импорт учебного плана из Excel
// ─────────────────────────────────────────────────────────────────────────

/// Разбирает Excel-шаблон и возвращает предпросмотр БЕЗ записи в базу.
///
/// Двухфазность намеренная: заполненная вручную таблица почти всегда
/// содержит опечатки в ФИО и названиях, из-за которых рвутся связи между
/// листами. Пользователь должен увидеть это до того, как данные попадут в БД.
#[tauri::command]
pub async fn schedule_preview_excel(
    path: String,
) -> Result<crate::infra::excel_import::ExcelImportPreview, String> {
    let p = std::path::PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || {
        crate::infra::excel_import::parse_workbook(&p).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Записывает разобранный Excel в базу одной транзакцией.
#[tauri::command]
pub async fn schedule_import_excel(
    state: State<'_, AppState>,
    path: String,
    // `false` — дополнить справочники, `true` — заменить целиком.
    // Замена необратима, поэтому по умолчанию выключена.
    replace: Option<bool>,
) -> Result<crate::infra::excel_import::ImportSummary, String> {
    let p = std::path::PathBuf::from(path);
    let preview = tauri::async_runtime::spawn_blocking(move || {
        crate::infra::excel_import::parse_workbook(&p).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    let mode = if replace.unwrap_or(false) {
        crate::infra::excel_import::ImportMode::Replace
    } else {
        crate::infra::excel_import::ImportMode::Merge
    };
    crate::infra::excel_import::apply(&state.pool, &preview, mode)
        .await
        .map_err(|e| e.to_string())
}

/// Накладки в сохранённом расписании варианта.
///
/// База их не отвергает: уникальность снята ради совмещённых уроков (см.
/// миграцию 0020), поэтому исторические конфликты нужно показывать явно.
#[tauri::command]
pub async fn schedule_find_conflicts(
    state: State<'_, AppState>,
    variant_id: Option<String>,
) -> Result<Vec<crate::domain::schedule::generation_service::SlotConflict>, String> {
    let vid = match variant_id {
        Some(v) => v,
        None => slots::get_active_variant_id(&state.pool).await.map_err(|e| e.to_string())?,
    };
    crate::domain::schedule::generation_service::find_slot_conflicts(&state.pool, &vid)
        .await
        .map_err(|e| e.to_string())
}

/// Настройки сетки расписания.
#[tauri::command]
pub async fn schedule_get_settings(
    state: State<'_, AppState>,
) -> Result<crate::domain::schedule::time_grid::TimeGrid, String> {
    crate::domain::schedule::time_grid::TimeGrid::load(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct SetSettingsInput {
    pub days: i64,
    pub periods_per_day: i64,
    pub shift_boundary_period: Option<i64>,
}

#[tauri::command]
pub async fn schedule_set_settings(
    state: State<'_, AppState>,
    input: SetSettingsInput,
) -> Result<crate::domain::schedule::time_grid::TimeGrid, String> {
    if !(1..=7).contains(&input.days) {
        return Err("дней в неделе: допустимо 1..7".to_string());
    }
    if !(1..=10).contains(&input.periods_per_day) {
        return Err("уроков в день: допустимо 1..10".to_string());
    }
    if let Some(b) = input.shift_boundary_period {
        if !(1..input.periods_per_day).contains(&b) {
            return Err("граница смен должна быть внутри дня".to_string());
        }
    }
    sqlx::query(
        "INSERT INTO schedule_settings (id, days_per_week, periods_per_day, shift_boundary_period) \
         VALUES ('default', ?1, ?2, ?3) \
         ON CONFLICT(id) DO UPDATE SET days_per_week = excluded.days_per_week, \
             periods_per_day = excluded.periods_per_day, \
             shift_boundary_period = excluded.shift_boundary_period",
    )
    .bind(input.days)
    .bind(input.periods_per_day)
    .bind(input.shift_boundary_period)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    crate::domain::schedule::time_grid::TimeGrid::load(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

/// Полная аналитика расписания: окна, СанПиН, нагрузка, кабинеты, покрытие.
#[tauri::command]
pub async fn schedule_analytics(
    state: State<'_, AppState>,
    variant_id: Option<String>,
) -> Result<crate::domain::schedule::analytics::ScheduleAnalytics, String> {
    let vid = match variant_id {
        Some(v) => v,
        None => slots::get_active_variant_id(&state.pool).await.map_err(|e| e.to_string())?,
    };
    crate::domain::schedule::analytics::compute(&state.pool, &vid)
        .await
        .map_err(|e| e.to_string())
}

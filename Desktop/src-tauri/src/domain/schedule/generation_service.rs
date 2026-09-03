//! Сборка контракта для солвера и коммит результата.
//!
//! Логика вынесена из `commands/schedule.rs`, где она была неотделима от
//! слоя Tauri и потому непроверяема: убедиться, что генерация передаёт
//! joint-уроки и закрепления, можно было только запустив приложение вручную.
//! Здесь она доступна и команде, и тестам, и CLI-инструментам.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::schedule::{curriculum, fixed_slots, rooms, slots, subjects, teachers};
use crate::db::DbError;
use crate::domain::schedule::time_grid::TimeGrid;

/// Параметры запуска солвера.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationParams {
    pub time_limit_sec: i64,
    pub num_workers: i64,
    pub seed: i64,
}

impl Default for GenerationParams {
    fn default() -> Self {
        Self { time_limit_sec: 60, num_workers: 8, seed: 42 }
    }
}

/// Собранный вход солвера вместе с данными, нужными для последующих проверок.
pub struct SolverInput {
    pub json: serde_json::Value,
    pub grid: TimeGrid,
    pub variant_id: String,
    pub fixed_count: usize,
    pub joint_group_count: usize,
}

/// Строит контракт солвера из состояния БД.
///
/// Единственное место, где формируется вход: команда, тест и CLI обязаны
/// вызывать эту функцию, иначе расхождение продуктового и скриптового путей
/// воспроизведётся заново.
pub async fn build_solver_input(
    pool: &SqlitePool,
    params: &GenerationParams,
) -> Result<SolverInput, DbError> {
    let teachers_db = teachers::list_teachers(pool).await?;
    let rooms_db = rooms::list_rooms(pool).await?;
    let subjects_db = subjects::list_subjects(pool).await?;
    let curriculum_db = curriculum::list_curriculum(pool).await?;
    let subgroup_rules = curriculum::list_subgroup_rules(pool).await?;
    let weights_db = slots::get_weights(pool).await?;
    let grid = TimeGrid::load(pool).await?;

    let variant_id = slots::get_active_variant_id(pool).await?;
    let fixed_db = fixed_slots::list_fixed_slots_for_variant(pool, &variant_id).await?;
    let previous_slots = slots::list_slots_for_variant(pool, &variant_id).await?;

    let classes_rows = sqlx::query_as::<_, (String, i64, String, i64, String)>(
        "SELECT id, grade, letter, headcount, shift FROM schedule_classes",
    )
    .fetch_all(pool)
    .await?;

    let teachers_json: Vec<serde_json::Value> = teachers_db
        .iter()
        .map(|t| {
            let avail: serde_json::Value = serde_json::from_str(&t.availability_json)
                .unwrap_or_else(|_| default_availability());
            let subject_ids: Vec<String> =
                serde_json::from_str(&t.subject_ids).unwrap_or_default();
            serde_json::json!({
                "id": t.id,
                "full_name": t.full_name,
                "base_room_id": t.base_room_id,
                "max_daily_lessons": t.max_daily_lessons,
                "availability": avail,
                "subject_ids": subject_ids,
                "is_combined": t.is_combined
            })
        })
        .collect();

    let classes_json: Vec<serde_json::Value> = classes_rows
        .iter()
        .map(|(id, grade, letter, headcount, shift)| {
            let sg: Vec<serde_json::Value> = subgroup_rules
                .iter()
                .filter(|r| &r.class_id == id)
                .map(|r| serde_json::json!({"subject_id": r.subject_id, "group_count": r.group_count}))
                .collect();
            serde_json::json!({
                "id": id, "grade": grade, "letter": letter,
                "headcount": headcount, "shift": shift, "subgroups": sg
            })
        })
        .collect();

    let rooms_json: Vec<serde_json::Value> = rooms_db
        .iter()
        .map(|r| serde_json::json!({
            "id": r.id, "name": r.name, "room_type": r.room_type,
            "capacity": r.capacity, "floor": r.floor
        }))
        .collect();

    let subjects_json: Vec<serde_json::Value> = subjects_db
        .iter()
        .map(|s| {
            let related: Vec<String> =
                serde_json::from_str(&s.related_subjects_json).unwrap_or_default();
            serde_json::json!({
                "id": s.id, "name": s.name, "sanitary_weight": s.sanitary_weight,
                "required_room_type": s.required_room_type,
                "requires_split": s.requires_split,
                "is_double_allowed": s.is_double_allowed,
                "related_subject_ids": related
            })
        })
        .collect();

    // joint_lesson_id обязан дойти до солвера: без него класс-комплекты
    // рассыпаются на независимые уроки.
    let curriculum_json: Vec<serde_json::Value> = curriculum_db
        .iter()
        .map(|c| serde_json::json!({
            "class_id": c.class_id,
            "subject_id": c.subject_id,
            "teacher_id": c.teacher_id,
            "split_teacher2_id": c.split_teacher2_id,
            "hours_per_week": c.hours_per_week,
            "joint_lesson_id": c.joint_lesson_id
        }))
        .collect();

    let joint_group_count = {
        let mut set = std::collections::HashSet::new();
        for c in &curriculum_db {
            if let Some(j) = c.joint_lesson_id.as_ref().filter(|j| !j.trim().is_empty()) {
                set.insert(j.clone());
            }
        }
        set.len()
    };

    // Закрепления пользователя вне сетки отбрасываются: иначе солвер
    // получит заведомо невыполнимое ограничение и вернёт INFEASIBLE.
    let fixed_json: Vec<serde_json::Value> = fixed_db
        .iter()
        .filter(|f| grid.contains(f.day, f.period))
        .enumerate()
        .map(|(idx, f)| serde_json::json!({
            "lesson_idx": idx,
            "class_id": f.class_id,
            "subject_id": f.subject_id,
            "teacher_id": f.teacher_id,
            "room_id": f.room_id,
            "day": f.day,
            "period": f.period,
            "subgroup_label": f.subgroup_label,
            "joint_lesson_id": f.joint_lesson_id
        }))
        .collect();

    // Ключ обязан совпадать с prev_key в solver/constraints/soft.py.
    let previous_grid: serde_json::Map<String, serde_json::Value> = previous_slots
        .iter()
        .map(|s| {
            (
                format!("{}|{}|{}|{}|{}", s.class_id, s.subject_id, s.teacher_id, s.day, s.period),
                serde_json::Value::Bool(true),
            )
        })
        .collect();

    let json = serde_json::json!({
        "schema_version": crate::infra::solver_host::SCHEMA_VERSION,
        "meta": {
            "school_name": "Vector",
            "generated_at": chrono::Utc::now().to_rfc3339(),
            "time_limit_sec": params.time_limit_sec,
            "num_workers": params.num_workers,
            "random_seed": params.seed
        },
        "time_grid": {
            "days": grid.days,
            "periods_per_day": grid.periods_per_day,
            "shift_boundary_period": grid.shift_boundary_period
        },
        "teachers": teachers_json,
        "classes": classes_json,
        "rooms": rooms_json,
        "subjects": subjects_json,
        "curriculum": curriculum_json,
        "fixed_lessons": fixed_json,
        "previous_grid": previous_grid,
        "weights": {
            "window": weights_db.window,
            "room_displacement": weights_db.room_displacement,
            "sanpin_parabola": weights_db.sanpin_parabola,
            "alternation": weights_db.alternation,
            "movement": weights_db.movement,
            "load_balance": weights_db.load_balance,
            "change_slot": weights_db.change_slot
        }
    });

    Ok(SolverInput {
        json,
        grid,
        variant_id,
        fixed_count: fixed_db.len(),
        joint_group_count,
    })
}

fn default_availability() -> serde_json::Value {
    let row = serde_json::json!([true, true, true, true, true, true, true, true]);
    serde_json::json!([row.clone(), row.clone(), row.clone(), row.clone(), row.clone(), row])
}

/// Записывает решение в указанный вариант, заменяя прежние слоты.
pub async fn commit_slots(
    pool: &SqlitePool,
    variant_id: &str,
    solver_slots: &[serde_json::Value],
) -> Result<usize, DbError> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM schedule_slots WHERE variant_id = ?1")
        .bind(variant_id)
        .execute(&mut *tx)
        .await?;

    let mut written = 0usize;
    for slot in solver_slots {
        let id = uuid::Uuid::new_v4().to_string();
        let joint = slot
            .get("joint_lesson_id")
            .and_then(|v| v.as_str())
            .filter(|j| !j.trim().is_empty());
        sqlx::query(
            "INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, \
             subgroup_label, day, period, variant_id, joint_lesson_id) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        )
        .bind(&id)
        .bind(slot.get("class_id").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(slot.get("subject_id").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(slot.get("teacher_id").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(slot.get("room_id").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(slot.get("subgroup_label").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(slot.get("day").and_then(|v| v.as_i64()).unwrap_or(0))
        .bind(slot.get("period").and_then(|v| v.as_i64()).unwrap_or(0))
        .bind(variant_id)
        .bind(joint)
        .execute(&mut *tx)
        .await?;
        written += 1;
    }
    tx.commit().await?;
    Ok(written)
}

// ─── Метрики качества решения: то, что раньше считали verify_*-скрипты ───

/// Число «окон» у учеников: пустых уроков между первым и последним занятием дня.
pub fn count_student_windows(slots: &[serde_json::Value]) -> i64 {
    use std::collections::HashMap;
    let mut by_class_day: HashMap<(String, i64), Vec<i64>> = HashMap::new();
    for s in slots {
        let c = s.get("class_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let d = s.get("day").and_then(|v| v.as_i64()).unwrap_or(0);
        let p = s.get("period").and_then(|v| v.as_i64()).unwrap_or(0);
        by_class_day.entry((c, d)).or_default().push(p);
    }
    let mut windows = 0;
    for periods in by_class_day.values() {
        let min = *periods.iter().min().unwrap_or(&0);
        let max = *periods.iter().max().unwrap_or(&0);
        let occupied: std::collections::HashSet<i64> = periods.iter().copied().collect();
        for p in min..=max {
            if !occupied.contains(&p) {
                windows += 1;
            }
        }
    }
    windows
}

/// Проверяет, что все классы одной joint-группы стоят в одном и том же слоте.
/// Возвращает описания расхождений; пустой вектор — синхронизация соблюдена.
pub fn check_joint_sync(slots: &[serde_json::Value]) -> Vec<String> {
    use std::collections::HashMap;
    // joint_lesson_id -> набор (day, period) -> классы
    let mut groups: HashMap<String, HashMap<(i64, i64), Vec<String>>> = HashMap::new();
    for s in slots {
        let Some(j) = s
            .get("joint_lesson_id")
            .and_then(|v| v.as_str())
            .filter(|j| !j.trim().is_empty())
        else {
            continue;
        };
        let d = s.get("day").and_then(|v| v.as_i64()).unwrap_or(0);
        let p = s.get("period").and_then(|v| v.as_i64()).unwrap_or(0);
        let c = s.get("class_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        groups.entry(j.to_string()).or_default().entry((d, p)).or_default().push(c);
    }

    let mut problems = Vec::new();
    for (joint_id, by_slot) in &groups {
        // Все классы группы обязаны присутствовать в КАЖДОМ занятом ею слоте.
        // Сравнение только размеров пропускало рассинхрон, при котором каждый
        // класс уехал в собственный слот.
        let all_classes: std::collections::BTreeSet<&String> =
            by_slot.values().flatten().collect();
        for ((day, period), classes) in by_slot {
            let here: std::collections::BTreeSet<&String> = classes.iter().collect();
            if here != all_classes {
                let missing: Vec<&str> = all_classes
                    .difference(&here)
                    .map(|c| c.as_str())
                    .collect();
                problems.push(format!(
                    "joint-группа «{joint_id}» в слоте {day}:{period} без классов {missing:?}"
                ));
            }
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(class: &str, d: i64, p: i64, joint: Option<&str>) -> serde_json::Value {
        serde_json::json!({
            "class_id": class, "subject_id": "x", "teacher_id": "t",
            "room_id": "r", "day": d, "period": p, "joint_lesson_id": joint
        })
    }

    #[test]
    fn counts_student_windows() {
        // Класс занят на уроках 0 и 2 — между ними одно окно.
        let slots = vec![s("c1", 0, 0, None), s("c1", 0, 2, None)];
        assert_eq!(count_student_windows(&slots), 1);
        // Подряд — окон нет.
        let dense = vec![s("c1", 0, 0, None), s("c1", 0, 1, None)];
        assert_eq!(count_student_windows(&dense), 0);
    }

    #[test]
    fn joint_sync_detects_desync() {
        let ok = vec![s("c1", 0, 0, Some("j")), s("c2", 0, 0, Some("j"))];
        assert!(check_joint_sync(&ok).is_empty());

        // Второй класс уехал в другой слот — группа рассыпалась.
        let bad = vec![s("c1", 0, 0, Some("j")), s("c2", 1, 3, Some("j"))];
        assert!(!check_joint_sync(&bad).is_empty());
    }

    #[tokio::test]
    async fn build_input_carries_joint_fixed_and_grid() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::connect(&dir.path().join("t.db")).await.unwrap();

        let t1 = teachers::upsert_teacher(
            &pool, None, "Учитель".into(), None, 0,
            "[]".to_string(), "[]".to_string(), false,
        ).await.unwrap();
        let r1 = rooms::upsert_room(&pool, None, "К1".into(), "General".into(), 30, None, None)
            .await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c1', 7, 'Б', 20, 'First')")
            .execute(&pool).await.unwrap();
        subjects::upsert_subject(&pool, "hist".into(), "История".into(), 8, None, false, false, "[]".into())
            .await.unwrap();
        curriculum::set_curriculum_entries(
            &pool,
            vec![("c1".into(), "hist".into(), t1.id.clone(), None, 2, Some("jl_a".to_string()))],
        ).await.unwrap();
        fixed_slots::insert_fixed_slot(
            &pool, "fs1", "default", "c1", "hist", &t1.id, &r1.id, 1, 2, None, Some("jl_a"),
        ).await.unwrap();

        let input = build_solver_input(&pool, &GenerationParams::default()).await.unwrap();

        // joint дошёл до контракта
        let curr = input.json["curriculum"].as_array().unwrap();
        assert_eq!(curr[0]["joint_lesson_id"], "jl_a", "joint_lesson_id обязан быть в контракте");
        assert_eq!(input.joint_group_count, 1);

        // закрепление дошло до контракта
        let fixed = input.json["fixed_lessons"].as_array().unwrap();
        assert_eq!(fixed.len(), 1, "закрепления обязаны передаваться солверу");
        assert_eq!(fixed[0]["day"], 1);
        assert_eq!(fixed[0]["joint_lesson_id"], "jl_a");

        // сетка берётся из настроек, а не из литерала
        assert_eq!(input.json["time_grid"]["days"], 5);
        assert_eq!(input.json["time_grid"]["periods_per_day"], 7);

        // previous_grid присутствует как объект (слотов пока нет)
        assert!(input.json["previous_grid"].is_object());
    }
}

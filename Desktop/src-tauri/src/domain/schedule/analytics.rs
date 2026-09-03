//! Аналитика расписания: окна, СанПиН, нагрузка, кабинеты, покрытие плана.
//!
//! Всё считается на стороне ядра, а не в интерфейсе: те же метрики нужны
//! автотестам и инструменту проверки генерации, а вторая реализация в UI
//! неизбежно разошлась бы с первой.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::DbError;
use crate::domain::schedule::time_grid::TimeGrid;

/// Шкала трудности предметов по СанПиН РК: пик умственной активности
/// приходится на 2–4 уроки, поэтому предметы 9–11 баллов там и должны стоять.
const HARD_SUBJECT_WEIGHT: i64 = 9;
/// Уроки (0-based), считающиеся пиком работоспособности.
const PEAK_PERIODS: [i64; 3] = [1, 2, 3];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeacherLoad {
    pub teacher_id: String,
    pub full_name: String,
    /// Занятий в неделю по факту расписания (совмещённый урок — одно занятие).
    pub lessons: i64,
    /// Часов по учебному плану (тоже с учётом совмещения).
    pub planned_hours: i64,
    /// «Окна» — свободные уроки между первым и последним занятием дня.
    pub windows: i64,
    /// Дней в неделе, когда учитель занят.
    pub working_days: i64,
    /// Самый загруженный день.
    pub max_lessons_per_day: i64,
    pub base_room_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassLoad {
    pub class_id: String,
    pub class_type: String,
    /// Окна у учеников — их быть не должно вовсе.
    pub windows: i64,
    pub lessons: i64,
    /// Уроков по дням недели.
    pub per_day: Vec<i64>,
    /// Суммарный балл трудности по дням (шкала СанПиН).
    pub difficulty_per_day: Vec<i64>,
    /// Сколько трудных предметов стоит вне пика работоспособности.
    pub hard_outside_peak: i64,
    /// Сколько трудных предметов стоит на последних уроках.
    pub hard_at_late_periods: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomUsage {
    pub room_id: String,
    pub name: String,
    pub room_type: String,
    pub lessons: i64,
    /// Доля занятых слотов, 0..1.
    pub utilization: f64,
}

/// Расхождение факта с учебным планом.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverageIssue {
    pub class_id: String,
    pub subject_id: String,
    pub planned: i64,
    pub scheduled: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleAnalytics {
    pub variant_id: String,
    pub grid: TimeGrid,
    pub total_lessons: i64,
    pub lessons_without_room: i64,

    pub student_windows: i64,
    pub teacher_windows: i64,

    pub teachers: Vec<TeacherLoad>,
    pub classes: Vec<ClassLoad>,
    pub rooms: Vec<RoomUsage>,

    /// Занятость по слотам: `[день][урок]` — сколько занятий идёт одновременно.
    pub heatmap: Vec<Vec<i64>>,

    /// Трудные предметы вне пика и на поздних уроках — по всей школе.
    pub sanpin_hard_outside_peak: i64,
    pub sanpin_hard_at_late_periods: i64,

    pub coverage_issues: Vec<CoverageIssue>,
    pub conflicts: Vec<super::generation_service::SlotConflict>,
}

struct SlotRow {
    class_id: String,
    subject_id: String,
    teacher_id: String,
    room_id: String,
    day: i64,
    period: i64,
    joint_lesson_id: Option<String>,
}

/// Считает окна: пустые уроки между первым и последним занятием дня.
fn count_windows(periods: &[i64]) -> i64 {
    if periods.len() < 2 {
        return 0;
    }
    let min = *periods.iter().min().unwrap();
    let max = *periods.iter().max().unwrap();
    let busy: HashSet<i64> = periods.iter().copied().collect();
    (min..=max).filter(|p| !busy.contains(p)).count() as i64
}

pub async fn compute(
    pool: &SqlitePool,
    variant_id: &str,
) -> Result<ScheduleAnalytics, DbError> {
    let grid = TimeGrid::load(pool).await?;

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, i64, i64, Option<String>)>(
        "SELECT class_id, subject_id, teacher_id, room_id, day, period, joint_lesson_id \
         FROM schedule_slots WHERE variant_id = ?1",
    )
    .bind(variant_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(class_id, subject_id, teacher_id, room_id, day, period, joint_lesson_id)| SlotRow {
        class_id,
        subject_id,
        teacher_id,
        room_id: room_id.unwrap_or_default(),
        day,
        period,
        joint_lesson_id: joint_lesson_id.filter(|j| !j.trim().is_empty()),
    })
    .collect::<Vec<_>>();

    let teachers = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT id, full_name, base_room_id FROM schedule_teachers",
    )
    .fetch_all(pool)
    .await?;

    let classes = sqlx::query_as::<_, (String, String)>(
        "SELECT id, COALESCE(class_type, 'normal') FROM schedule_classes",
    )
    .fetch_all(pool)
    .await?;

    let rooms = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, name, room_type FROM schedule_rooms",
    )
    .fetch_all(pool)
    .await?;

    let subject_weight: HashMap<String, i64> =
        sqlx::query_as::<_, (String, i64)>("SELECT id, sanitary_weight FROM schedule_subjects")
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect();

    // ─── Классы: окна, нагрузка по дням, СанПиН ───
    let mut class_periods: HashMap<(&str, i64), Vec<i64>> = HashMap::new();
    let mut class_difficulty: HashMap<(&str, i64), i64> = HashMap::new();
    let mut hard_outside_peak_by_class: HashMap<&str, i64> = HashMap::new();
    let mut hard_late_by_class: HashMap<&str, i64> = HashMap::new();

    let last_period = grid.periods_per_day - 1;
    for r in &rows {
        class_periods.entry((&r.class_id, r.day)).or_default().push(r.period);
        let w = subject_weight.get(&r.subject_id).copied().unwrap_or(5);
        *class_difficulty.entry((&r.class_id, r.day)).or_insert(0) += w;
        if w >= HARD_SUBJECT_WEIGHT {
            if !PEAK_PERIODS.contains(&r.period) {
                *hard_outside_peak_by_class.entry(&r.class_id).or_insert(0) += 1;
            }
            // «Поздний» урок — предпоследний и далее.
            if r.period >= (last_period - 1).max(0) {
                *hard_late_by_class.entry(&r.class_id).or_insert(0) += 1;
            }
        }
    }

    let mut class_stats: Vec<ClassLoad> = classes
        .iter()
        .map(|(cid, ctype)| {
            let mut windows = 0;
            let mut lessons = 0;
            let mut per_day = vec![0i64; grid.days as usize];
            let mut difficulty_per_day = vec![0i64; grid.days as usize];
            for d in 0..grid.days {
                if let Some(ps) = class_periods.get(&(cid.as_str(), d)) {
                    windows += count_windows(ps);
                    lessons += ps.len() as i64;
                    if let Some(slot) = per_day.get_mut(d as usize) {
                        *slot = ps.len() as i64;
                    }
                }
                if let Some(diff) = class_difficulty.get(&(cid.as_str(), d)) {
                    if let Some(slot) = difficulty_per_day.get_mut(d as usize) {
                        *slot = *diff;
                    }
                }
            }
            ClassLoad {
                class_id: cid.clone(),
                class_type: ctype.clone(),
                windows,
                lessons,
                per_day,
                difficulty_per_day,
                hard_outside_peak: hard_outside_peak_by_class.get(cid.as_str()).copied().unwrap_or(0),
                hard_at_late_periods: hard_late_by_class.get(cid.as_str()).copied().unwrap_or(0),
            }
        })
        .collect();
    class_stats.sort_by(|a, b| b.windows.cmp(&a.windows).then(a.class_id.cmp(&b.class_id)));

    // ─── Учителя: занятия считаются физически ───
    // Совмещённый урок — одно занятие учителя, а не по одному на каждый класс.
    let mut teacher_slots: HashMap<&str, HashSet<(i64, i64)>> = HashMap::new();
    for r in &rows {
        teacher_slots.entry(&r.teacher_id).or_default().insert((r.day, r.period));
    }

    let mut planned: HashMap<String, i64> = HashMap::new();
    {
        let curriculum = sqlx::query_as::<_, (String, Option<String>, i64, Option<String>)>(
            "SELECT teacher_id, split_teacher2_id, hours_per_week, joint_lesson_id \
             FROM schedule_curriculum",
        )
        .fetch_all(pool)
        .await?;
        let mut seen: HashSet<(String, String)> = HashSet::new();
        for (t1, t2, hours, joint) in curriculum {
            for t in [Some(t1), t2].into_iter().flatten() {
                if let Some(j) = joint.as_ref().filter(|j| !j.trim().is_empty()) {
                    if !seen.insert((t.clone(), j.clone())) {
                        continue;
                    }
                }
                *planned.entry(t).or_insert(0) += hours;
            }
        }
    }

    let mut teacher_stats: Vec<TeacherLoad> = teachers
        .iter()
        .map(|(tid, name, base_room)| {
            let slots = teacher_slots.get(tid.as_str());
            let mut by_day: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
            if let Some(set) = slots {
                for (d, p) in set {
                    by_day.entry(*d).or_default().push(*p);
                }
            }
            let windows: i64 = by_day.values().map(|ps| count_windows(ps)).sum();
            let lessons: i64 = by_day.values().map(|ps| ps.len() as i64).sum();
            let max_per_day = by_day.values().map(|ps| ps.len() as i64).max().unwrap_or(0);
            TeacherLoad {
                teacher_id: tid.clone(),
                full_name: name.clone(),
                lessons,
                planned_hours: planned.get(tid).copied().unwrap_or(0),
                windows,
                working_days: by_day.len() as i64,
                max_lessons_per_day: max_per_day,
                base_room_id: base_room.clone(),
            }
        })
        .collect();
    teacher_stats.sort_by(|a, b| b.windows.cmp(&a.windows).then(b.lessons.cmp(&a.lessons)));

    // ─── Кабинеты ───
    let total_slots = grid.total_slots().max(1) as f64;
    let mut room_lessons: HashMap<&str, HashSet<(i64, i64)>> = HashMap::new();
    for r in &rows {
        if !r.room_id.trim().is_empty() {
            room_lessons.entry(&r.room_id).or_default().insert((r.day, r.period));
        }
    }
    let mut room_stats: Vec<RoomUsage> = rooms
        .iter()
        .map(|(rid, name, rtype)| {
            let used = room_lessons.get(rid.as_str()).map(|s| s.len()).unwrap_or(0) as i64;
            RoomUsage {
                room_id: rid.clone(),
                name: name.clone(),
                room_type: rtype.clone(),
                lessons: used,
                utilization: used as f64 / total_slots,
            }
        })
        .collect();
    room_stats.sort_by(|a, b| b.lessons.cmp(&a.lessons));

    // ─── Тепловая карта занятости ───
    let mut heatmap = vec![vec![0i64; grid.periods_per_day as usize]; grid.days as usize];
    for r in &rows {
        if let Some(day) = heatmap.get_mut(r.day as usize) {
            if let Some(cell) = day.get_mut(r.period as usize) {
                *cell += 1;
            }
        }
    }

    // ─── Покрытие учебного плана ───
    let planned_pairs = sqlx::query_as::<_, (String, String, i64)>(
        "SELECT class_id, subject_id, hours_per_week FROM schedule_curriculum",
    )
    .fetch_all(pool)
    .await?;
    let mut scheduled_pairs: HashMap<(String, String), i64> = HashMap::new();
    for r in &rows {
        *scheduled_pairs
            .entry((r.class_id.clone(), r.subject_id.clone()))
            .or_insert(0) += 1;
    }
    let mut coverage_issues: Vec<CoverageIssue> = planned_pairs
        .into_iter()
        .filter_map(|(class_id, subject_id, hours)| {
            let got = scheduled_pairs
                .get(&(class_id.clone(), subject_id.clone()))
                .copied()
                .unwrap_or(0);
            (got != hours).then_some(CoverageIssue {
                class_id,
                subject_id,
                planned: hours,
                scheduled: got,
            })
        })
        .collect();
    coverage_issues.sort_by_key(|c| (c.scheduled - c.planned).abs());
    coverage_issues.reverse();

    let conflicts = super::generation_service::find_slot_conflicts(pool, variant_id).await?;

    Ok(ScheduleAnalytics {
        variant_id: variant_id.to_string(),
        grid,
        total_lessons: rows.len() as i64,
        lessons_without_room: rows.iter().filter(|r| r.room_id.trim().is_empty()).count() as i64,
        student_windows: class_stats.iter().map(|c| c.windows).sum(),
        teacher_windows: teacher_stats.iter().map(|t| t.windows).sum(),
        sanpin_hard_outside_peak: class_stats.iter().map(|c| c.hard_outside_peak).sum(),
        sanpin_hard_at_late_periods: class_stats.iter().map(|c| c.hard_at_late_periods).sum(),
        teachers: teacher_stats,
        classes: class_stats,
        rooms: room_stats,
        heatmap,
        coverage_issues,
        conflicts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_are_gaps_between_first_and_last() {
        assert_eq!(count_windows(&[0, 1, 2]), 0, "подряд — окон нет");
        assert_eq!(count_windows(&[0, 2]), 1);
        assert_eq!(count_windows(&[0, 3]), 2);
        assert_eq!(count_windows(&[2]), 0, "один урок — окон нет");
        assert_eq!(count_windows(&[]), 0);
        // Свободные уроки в начале и конце дня окнами не являются.
        assert_eq!(count_windows(&[3, 4, 5]), 0);
    }

    async fn seed(pool: &SqlitePool) {
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type) VALUES ('c1',7,'А',20,'First','normal')")
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO schedule_teachers (id, full_name, max_daily_lessons, availability_json, subject_ids) VALUES ('t1','Учитель',0,'[]','[]')")
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO schedule_rooms (id, name, room_type, capacity) VALUES ('r1','К1','General',30)")
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO schedule_subjects (id, name, sanitary_weight, requires_split, is_double_allowed, related_subjects_json) VALUES ('alg','Алгебра',10,0,0,'[]')")
            .execute(pool).await.unwrap();
    }

    #[tokio::test]
    async fn detects_student_window_and_late_hard_subject() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::connect(&dir.path().join("t.db")).await.unwrap();
        seed(&pool).await;
        // Уроки 0 и 2 -> одно окно. Урок 6 (последний из 7) -> трудный предмет поздно.
        for (id, period) in [("s1", 0), ("s2", 2), ("s3", 6)] {
            sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, variant_id) VALUES (?1,'c1','alg','t1','r1','',0,?2,'default')")
                .bind(id).bind(period).execute(&pool).await.unwrap();
        }
        let a = compute(&pool, "default").await.unwrap();
        assert_eq!(a.total_lessons, 3);
        // Заняты уроки 0, 2, 6 -> пустые 1, 3, 4, 5 = четыре окна.
        assert_eq!(a.student_windows, 4);
        assert_eq!(a.teacher_windows, 4, "у учителя те же окна");
        assert!(a.sanpin_hard_at_late_periods >= 1, "алгебра на последнем уроке");
        assert_eq!(a.classes[0].per_day[0], 3);
    }

    #[tokio::test]
    async fn joint_lesson_counts_once_for_teacher() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::connect(&dir.path().join("t.db")).await.unwrap();
        seed(&pool).await;
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type) VALUES ('c2',7,'Б',8,'First','luo')")
            .execute(&pool).await.unwrap();
        for (id, class) in [("j1", "c1"), ("j2", "c2")] {
            sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, variant_id, joint_lesson_id) VALUES (?1,?2,'alg','t1','r1','',0,0,'default','jl')")
                .bind(id).bind(class).execute(&pool).await.unwrap();
        }
        let a = compute(&pool, "default").await.unwrap();
        assert_eq!(a.total_lessons, 2, "в расписании два класса");
        let t = &a.teachers[0];
        assert_eq!(t.lessons, 1, "для учителя совмещённый урок — одно занятие");
        assert!(a.conflicts.is_empty(), "joint не считается накладкой");
    }

    #[tokio::test]
    async fn reports_coverage_gap() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::connect(&dir.path().join("t.db")).await.unwrap();
        seed(&pool).await;
        sqlx::query("INSERT INTO schedule_curriculum (id, class_id, subject_id, teacher_id, hours_per_week) VALUES ('cu1','c1','alg','t1',3)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, variant_id) VALUES ('s1','c1','alg','t1','r1','',0,0,'default')")
            .execute(&pool).await.unwrap();
        let a = compute(&pool, "default").await.unwrap();
        assert_eq!(a.coverage_issues.len(), 1);
        assert_eq!(a.coverage_issues[0].planned, 3);
        assert_eq!(a.coverage_issues[0].scheduled, 1);
    }
}

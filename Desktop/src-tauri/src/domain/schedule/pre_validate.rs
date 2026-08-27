use std::collections::HashMap;

use super::model::{AvailabilityMatrix, ScheduleCurriculum, ScheduleRoom, ScheduleSubject, ScheduleTeacher};

/// Результат пре-валидации: список ошибок, каждая из которых — причина INFEASIBLE.
#[derive(Debug, Clone)]
pub struct PreValidationResult {
    pub errors: Vec<String>,
}

impl PreValidationResult {
    pub fn ok() -> Self {
        Self { errors: Vec::new() }
    }

    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }

    pub fn merge(&mut self, other: PreValidationResult) {
        self.errors.extend(other.errors);
    }
}

/// Подсчёт доступных слотов с учётом max_daily_lessons.
/// Если max_daily_lessons > 0, то учитель не может работать больше N уроков в день.
fn count_available_slots_with_daily_limit(
    teacher: &ScheduleTeacher,
    days: usize,
    periods_per_day: usize,
) -> usize {
    let m = match AvailabilityMatrix::from_json(&teacher.availability_json) {
        Ok(m) => m,
        Err(_) => AvailabilityMatrix::all_available(),
    };
    let max_daily = teacher.max_daily_lessons as usize;
    let mut total = 0;
    for day in m.0.iter().take(days) {
        let day_available: usize = day.iter().take(periods_per_day).filter(|&&v| v).count();
        if max_daily > 0 {
            total += day_available.min(max_daily);
        } else {
            total += day_available;
        }
    }
    total
}

/// 1. Проверка: сумма часов учителя не превышает его доступные слоты.
fn pre_validate_teachers(
    teachers: &[ScheduleTeacher],
    curriculum: &[ScheduleCurriculum],
    days: usize,
    periods_per_day: usize,
) -> PreValidationResult {
    let mut result = PreValidationResult::ok();

    // Подсчёт физической нагрузки учителя с учётом совмещенных уроков (joint_lesson_id)
    let mut hours_by_teacher: HashMap<String, i64> = HashMap::new();
    let mut joint_groups_by_teacher: HashMap<String, HashMap<String, i64>> = HashMap::new();

    for entry in curriculum {
        let t1 = entry.teacher_id.clone();
        if let Some(ref jid) = entry.joint_lesson_id {
            if !jid.trim().is_empty() {
                let grp = joint_groups_by_teacher.entry(t1.clone()).or_default();
                let cur_max = grp.entry(jid.clone()).or_insert(0);
                *cur_max = (*cur_max).max(entry.hours_per_week);

                if let Some(ref split_id) = entry.split_teacher2_id {
                    let grp2 = joint_groups_by_teacher.entry(split_id.clone()).or_default();
                    let cur_max2 = grp2.entry(jid.clone()).or_insert(0);
                    *cur_max2 = (*cur_max2).max(entry.hours_per_week);
                }
                continue;
            }
        }

        *hours_by_teacher.entry(t1).or_insert(0) += entry.hours_per_week;
        if let Some(ref split_id) = entry.split_teacher2_id {
            *hours_by_teacher.entry(split_id.clone()).or_insert(0) += entry.hours_per_week;
        }
    }

    for (t_id, jmap) in joint_groups_by_teacher {
        let total_joint: i64 = jmap.values().sum();
        *hours_by_teacher.entry(t_id).or_insert(0) += total_joint;
    }

    for teacher in teachers {
        let assigned = hours_by_teacher.get(&teacher.id).copied().unwrap_or(0);
        if assigned == 0 {
            continue;
        }
        let available = count_available_slots_with_daily_limit(teacher, days, periods_per_day);
        if assigned as usize > available {
            result.errors.push(format!(
                "Учитель «{}»: {} ч/нед нагрузки, но доступно лишь {} слотов (max_daily={})",
                teacher.full_name, assigned, available, teacher.max_daily_lessons
            ));
        }
    }

    result
}

/// 2. Проверка: спецкабинеты — хватает ли слотов для предметов с required_room_type.
fn pre_validate_rooms(
    subjects: &[ScheduleSubject],
    curriculum: &[ScheduleCurriculum],
    rooms: &[ScheduleRoom],
    days: usize,
    periods_per_day: usize,
) -> PreValidationResult {
    let mut result = PreValidationResult::ok();
    let total_slots = days * periods_per_day;

    // Подсчёт кабинетов по типам
    let mut room_count_by_type: HashMap<String, usize> = HashMap::new();
    for room in rooms {
        *room_count_by_type.entry(room.room_type.clone()).or_insert(0) += 1;
    }

    // Сумма часов по required_room_type
    // Для split-предметов обе подгруппы занимают кабинеты типа одновременно → ×2
    let subj_by_id: HashMap<&str, &ScheduleSubject> =
        subjects.iter().map(|s| (s.id.as_str(), s)).collect();
    let mut hours_by_room_type: HashMap<String, i64> = HashMap::new();
    for entry in curriculum {
        if let Some(subj) = subj_by_id.get(entry.subject_id.as_str()) {
            if let Some(ref rt) = subj.required_room_type {
                let multiplier = if subj.requires_split { 2 } else { 1 };
                *hours_by_room_type.entry(rt.clone()).or_insert(0) += entry.hours_per_week * multiplier;
            }
        }
    }

    for (rt, needed) in &hours_by_room_type {
        let room_cnt = room_count_by_type.get(rt.as_str()).copied().unwrap_or(0);
        let capacity = room_cnt * total_slots;
        if *needed as usize > capacity {
            result.errors.push(format!(
                "Предметы с типом кабинета «{}»: нужно {} ч/нед, но только {} слотов ({} каб. × {} слотов)",
                rt, needed, capacity, room_cnt, total_slots
            ));
        }
    }

    result
}

/// 3. Проверка: split — пересечение availability двух учителей.
fn pre_validate_split_teachers(
    subjects: &[ScheduleSubject],
    curriculum: &[ScheduleCurriculum],
    teachers: &[ScheduleTeacher],
    periods_per_day: usize,
) -> PreValidationResult {
    let mut result = PreValidationResult::ok();

    let subj_by_id: HashMap<&str, &ScheduleSubject> =
        subjects.iter().map(|s| (s.id.as_str(), s)).collect();
    let teacher_by_id: HashMap<&str, &ScheduleTeacher> =
        teachers.iter().map(|t| (t.id.as_str(), t)).collect();

    for entry in curriculum {
        if let Some(subj) = subj_by_id.get(entry.subject_id.as_str()) {
            if subj.requires_split {
                if let Some(ref split_id) = entry.split_teacher2_id {
                    let t1 = teacher_by_id.get(entry.teacher_id.as_str());
                    let t2 = teacher_by_id.get(split_id.as_str());
                    if let (Some(teacher1), Some(teacher2)) = (t1, t2) {
                        if !has_overlapping_availability(teacher1, teacher2, periods_per_day) {
                            result.errors.push(format!(
                                "Split-конфликт: «{}» и «{}» не имеют общих окон для предмета «{}» (класс {})",
                                teacher1.full_name, teacher2.full_name, subj.name, entry.class_id
                            ));
                        }
                    }
                }
            }
        }
    }

    result
}

/// Проверка пересечения availability двух учителей.
fn has_overlapping_availability(t1: &ScheduleTeacher, t2: &ScheduleTeacher, periods_per_day: usize) -> bool {
    let m1 = match AvailabilityMatrix::from_json(&t1.availability_json) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let m2 = match AvailabilityMatrix::from_json(&t2.availability_json) {
        Ok(m) => m,
        Err(_) => return false,
    };
    for day in 0..6 {
        for period in 0..periods_per_day {
            if m1.0[day][period] && m2.0[day][period] {
                return true;
            }
        }
    }
    false
}

/// 4. Проверка: класс — влезает ли суммарная нагрузка в слоты класса (с учётом смены).
fn pre_validate_class_capacity(
    curriculum: &[ScheduleCurriculum],
    days: usize,
    periods_per_day: usize,
) -> PreValidationResult {
    let mut result = PreValidationResult::ok();

    // Максимум слотов для класса: days × periods_per_day
    // (смены уже ограничены в create_variables, но здесь считаем общий потолок)
    let max_slots = days * periods_per_day;

    let mut hours_by_class: HashMap<String, i64> = HashMap::new();
    for entry in curriculum {
        *hours_by_class.entry(entry.class_id.clone()).or_insert(0) += entry.hours_per_week;
    }

    for (class_id, total_hours) in &hours_by_class {
        if *total_hours as usize > max_slots {
            result.errors.push(format!(
                "Класс {}: {} ч/нед нагрузки, но.max {} слотов доступно ({} дней × {} урока)",
                class_id, total_hours, max_slots, days, periods_per_day
            ));
        }
    }

    result
}

/// Запуск всех проверок. Возвращает PreValidationResult.
pub fn pre_validate_all(
    teachers: &[ScheduleTeacher],
    subjects: &[ScheduleSubject],
    rooms: &[ScheduleRoom],
    curriculum: &[ScheduleCurriculum],
    days: usize,
    periods_per_day: usize,
) -> PreValidationResult {
    let mut result = PreValidationResult::ok();

    result.merge(pre_validate_teachers(teachers, curriculum, days, periods_per_day));
    result.merge(pre_validate_rooms(subjects, curriculum, rooms, days, periods_per_day));
    result.merge(pre_validate_split_teachers(subjects, curriculum, teachers, periods_per_day));
    result.merge(pre_validate_class_capacity(curriculum, days, periods_per_day));

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_teacher(id: &str, avail: &str, max_daily: i64) -> ScheduleTeacher {
        ScheduleTeacher {
            id: id.to_string(),
            full_name: format!("Teacher {}", id),
            base_room_id: None,
            max_daily_lessons: max_daily,
            availability_json: avail.to_string(),
            subject_ids: "[]".to_string(),
            is_combined: false,
        }
    }

    fn full_avail() -> String {
        "[[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true],[true,true,true,true,true,true,true,true]]".to_string()
    }

    fn limited_avail() -> String {
        // Только понедельник-среда, по 4 урока
        "[[true,true,true,true,false,false,false,false],[true,true,true,true,false,false,false,false],[true,true,true,true,false,false,false,false],[false,false,false,false,false,false,false,false],[false,false,false,false,false,false,false,false],[false,false,false,false,false,false,false,false]]".to_string()
    }

    #[test]
    fn teacher_hours_ok() {
        let teachers = vec![make_teacher("t1", &full_avail(), 0)];
        let curriculum = vec![ScheduleCurriculum {
            id: "c1".into(),
            class_id: "cls1".into(),
            subject_id: "s1".into(),
            teacher_id: "t1".into(),
            split_teacher2_id: None,
            hours_per_week: 20,
        }];
        let result = pre_validate_teachers(&teachers, &curriculum, 6, 7);
        assert!(result.is_ok());
    }

    #[test]
    fn teacher_hours_exceeded() {
        let teachers = vec![make_teacher("t1", &limited_avail(), 0)];
        let curriculum = vec![ScheduleCurriculum {
            id: "c1".into(),
            class_id: "cls1".into(),
            subject_id: "s1".into(),
            teacher_id: "t1".into(),
            split_teacher2_id: None,
            hours_per_week: 20,
        }];
        let result = pre_validate_teachers(&teachers, &curriculum, 6, 7);
        assert!(!result.is_ok());
        assert!(result.errors[0].contains("20 ч/нед"));
    }

    #[test]
    fn teacher_daily_limit() {
        // available: 3 days × 4 slots = 12, but max_daily=2 → 3×2=6
        let teachers = vec![make_teacher("t1", &limited_avail(), 2)];
        let curriculum = vec![ScheduleCurriculum {
            id: "c1".into(),
            class_id: "cls1".into(),
            subject_id: "s1".into(),
            teacher_id: "t1".into(),
            split_teacher2_id: None,
            hours_per_week: 7,
        }];
        let result = pre_validate_teachers(&teachers, &curriculum, 6, 7);
        assert!(!result.is_ok());
        assert!(result.errors[0].contains("max_daily=2"));
    }

    #[test]
    fn split_no_overlap() {
        let t1 = make_teacher("t1", &limited_avail(), 0);
        let t2 = make_teacher("t2", &limited_avail(), 0);
        let subjects = vec![ScheduleSubject {
            id: "s1".into(),
            name: "English".into(),
            sanitary_weight: 5,
            required_room_type: None,
            requires_split: true,
            is_double_allowed: false,
            related_subjects_json: "[]".into(),
        }];
        // t1: Mon-Wed, t2: Thu-Sat — no overlap
        let t2_shifted = ScheduleTeacher {
            availability_json: "[[false,false,false,false,false,false,false,false],[false,false,false,false,false,false,false,false],[false,false,false,false,false,false,false,false],[true,true,true,true,false,false,false,false],[true,true,true,true,false,false,false,false],[true,true,true,true,false,false,false,false]]".to_string(),
            ..t2
        };
        let curriculum = vec![ScheduleCurriculum {
            id: "c1".into(),
            class_id: "cls1".into(),
            subject_id: "s1".into(),
            teacher_id: "t1".into(),
            split_teacher2_id: Some("t2".into()),
            hours_per_week: 4,
        }];
        let result = pre_validate_split_teachers(&subjects, &curriculum, &[t1, t2_shifted], 7);
        assert!(!result.is_ok());
        assert!(result.errors[0].contains("не имеют общих окон"));
    }
}

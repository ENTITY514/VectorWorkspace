//! Сервис КТП (Фаза 4): генерация плана из ТУП, авторасчёт дат по
//! производственному календарю РК, валидация инвариантов оценивания.
//! Чистая логика — без БД; персистентность в `repo_ktp`.

use chrono::NaiveDate;

use crate::domain::invariants::LessonKind;
use crate::domain::ktp::{KtpLesson, KtpPlan, KtpQuarter, KtpStatus, LessonObjective};
use crate::domain::rk_calendar::RkCalendar;
use crate::domain::tup::{FullTupDocument, LearningObjective};

/// Параметры генерации КТП.
pub struct GenerateParams {
    pub subject_id: String,
    pub grade: i64,
    pub academic_year: String,
    /// Начальный год учебного года (для календаря РК).
    pub start_year: i32,
    /// ISO-номера дней недели расписания (1=Пн … 7=Вс).
    pub days_of_week: Vec<u32>,
}

/// Учебные недели по четвертям. Должно совпадать с `QUARTER_WEEKS`
/// на фронте (`Desktop/src/ktp/hoursValidation.ts`).
pub const QUARTER_WEEKS: [i64; 4] = [8, 8, 10, 8];

/// Часы в неделю: сначала нагрузка ТУП для класса, иначе число дней
/// расписания, иначе 2. Пустые/нулевые часы ТУП больше не подменяют норму двойкой,
/// если учитель уже указал дни недели.
fn hours_per_week_of(doc: &FullTupDocument, p: &GenerateParams) -> i64 {
    if let Some(h) = doc.hours.iter().find(|h| h.grade == p.grade) {
        let n = h.hours_per_week.round() as i64;
        if n > 0 {
            return n;
        }
    }
    let from_days = p.days_of_week.len() as i64;
    if from_days > 0 {
        from_days
    } else {
        2
    }
}

fn weeks_of(quarter_number: i64) -> i64 {
    QUARTER_WEEKS
        .get((quarter_number as usize).saturating_sub(1))
        .copied()
        .unwrap_or(8)
}

#[derive(Clone)]
struct ContentSeed {
    section: String,
    topic: String,
    objectives: Vec<LessonObjective>,
}

fn resolve_objective(
    code: &str,
    objectives_by_code: &std::collections::HashMap<String, &LearningObjective>,
) -> LessonObjective {
    let norm = code.replace(char::is_whitespace, "");
    match objectives_by_code.get(&norm) {
        Some(o) => LessonObjective {
            code: o.code.clone(),
            description: o.description.clone(),
        },
        None => LessonObjective {
            code: code.to_string(),
            description: String::new(),
        },
    }
}

fn push_lesson(
    out: &mut Vec<KtpLesson>,
    quarter_id: crate::domain::ids::KtpQuarterId,
    global_index: &mut i64,
    topic: String,
    kind: LessonKind,
    section: String,
    objectives: Vec<LessonObjective>,
) {
    *global_index += 1;
    let mut lesson = KtpLesson::new(
        quarter_id,
        *global_index,
        out.len() as i64 + 1,
        topic,
        kind,
    );
    lesson.section_name = section;
    lesson.objectives = objectives;
    out.push(lesson);
}

fn fill_empty_quarter(
    quarter_id: crate::domain::ids::KtpQuarterId,
    quarter_number: i64,
    target: usize,
    hours_per_week: i64,
    global_index: &mut i64,
) -> Vec<KtpLesson> {
    let mut out = Vec::new();
    if target == 0 {
        return out;
    }
    let rev_count = (hours_per_week as usize).max(1).min(target.saturating_sub(1));
    let soch_at = target.saturating_sub(rev_count);
    for i in 0..soch_at {
        if i + 1 == soch_at {
            push_lesson(
                &mut out,
                quarter_id,
                global_index,
                format!("Суммативное оценивание за {quarter_number} четверть"),
                LessonKind::Soch,
                "Суммативное оценивание за четверть".into(),
                Vec::new(),
            );
        } else {
            push_lesson(
                &mut out,
                quarter_id,
                global_index,
                format!("Тема {}", i + 1),
                LessonKind::Standard,
                "Темы долгосрочного планирования".into(),
                Vec::new(),
            );
        }
    }
    for i in 0..rev_count {
        push_lesson(
            &mut out,
            quarter_id,
            global_index,
            format!("Повторение #{}", i + 1),
            LessonKind::Revision,
            "Повторение".into(),
            Vec::new(),
        );
    }
    out
}

fn generate_quarter_lessons(
    tq: &crate::domain::tup::TupQuarter,
    quarter_id: crate::domain::ids::KtpQuarterId,
    quarter_number: i64,
    target: usize,
    hours_per_week: i64,
    objectives_by_code: &std::collections::HashMap<String, &LearningObjective>,
    global_index: &mut i64,
) -> Vec<KtpLesson> {
    let mut by_section: Vec<(String, Vec<ContentSeed>)> = tq
        .sections
        .iter()
        .map(|section| {
            let seeds = section
                .topics
                .iter()
                .map(|topic| ContentSeed {
                    section: section.name.clone(),
                    topic: topic.name.clone(),
                    objectives: topic
                        .objective_codes
                        .iter()
                        .map(|c| resolve_objective(c, objectives_by_code))
                        .collect(),
                })
                .collect::<Vec<_>>();
            (section.name.clone(), seeds)
        })
        .filter(|(_, seeds)| !seeds.is_empty())
        .collect();

    let start_global = *global_index;

    if by_section.is_empty() {
        return fill_empty_quarter(quarter_id, quarter_number, target, hours_per_week, global_index);
    }

    let n_sec = by_section.len();
    let mut rev_count = (hours_per_week as usize).max(2);
    let mut a10_mid = n_sec.saturating_sub(1);
    let mut sor_count = n_sec;

    let content_len = |sections: &[(String, Vec<ContentSeed>)]| {
        sections.iter().map(|(_, s)| s.len()).sum::<usize>()
    };
    let overhead = |sor: usize, mid: usize, rev: usize| sor + mid + 1 + 1 + rev;

    // Компактно: одна тема = один урок (все цели вместе). Свободные часы
    // сначала дробят многоцелевые темы, затем копируют последний урок раздела.
    while content_len(&by_section) + overhead(sor_count, a10_mid, rev_count) < target {
        let mut split = false;
        for (_, seeds) in by_section.iter_mut() {
            if let Some(pos) = seeds.iter().position(|s| s.objectives.len() > 1) {
                let section = seeds[pos].section.clone();
                let topic = seeds[pos].topic.clone();
                let rest = seeds[pos].objectives.split_off(1);
                seeds.insert(
                    pos + 1,
                    ContentSeed {
                        section,
                        topic,
                        objectives: rest,
                    },
                );
                split = true;
                break;
            }
        }
        if !split {
            break;
        }
    }

    let mut extra_i = 0;
    while content_len(&by_section) + overhead(sor_count, a10_mid, rev_count) < target {
        let sec_i = extra_i % n_sec;
        extra_i += 1;
        if let Some(last) = by_section[sec_i].1.last().cloned() {
            by_section[sec_i].1.push(last);
        } else {
            break;
        }
    }

    while content_len(&by_section) + overhead(sor_count, a10_mid, rev_count) > target {
        let Some((idx, _)) = by_section
            .iter()
            .enumerate()
            .filter(|(_, (_, seeds))| seeds.len() >= 2)
            .max_by_key(|(_, (_, seeds))| seeds.len())
        else {
            break;
        };
        let last = by_section[idx].1.pop().expect("len >= 2");
        if let Some(prev) = by_section[idx].1.last_mut() {
            prev.objectives.extend(last.objectives);
        }
    }

    while content_len(&by_section) + overhead(sor_count, a10_mid, rev_count) > target && a10_mid > 0 {
        a10_mid -= 1;
    }
    while content_len(&by_section) + overhead(sor_count, a10_mid, rev_count) > target && sor_count > 1 {
        sor_count -= 1;
    }
    if content_len(&by_section) + overhead(sor_count, a10_mid, rev_count) > target {
        rev_count = (hours_per_week as usize).max(1);
    }

    let section_names: Vec<String> = by_section.iter().map(|(n, _)| n.clone()).collect();
    let first_sor_idx = n_sec.saturating_sub(sor_count);
    let mut out = Vec::new();

    for (i, (sec_name, seeds)) in by_section.into_iter().enumerate() {
        let mut last_standard: Option<KtpLesson> = None;
        for seed in seeds {
            push_lesson(
                &mut out,
                quarter_id,
                global_index,
                seed.topic,
                LessonKind::Standard,
                seed.section,
                seed.objectives,
            );
            last_standard = out.last().cloned();
        }

        if i >= first_sor_idx {
            push_lesson(
                &mut out,
                quarter_id,
                global_index,
                format!("СОР по разделу «{sec_name}»"),
                LessonKind::Sor,
                "Суммативное оценивание за раздел".into(),
                Vec::new(),
            );
            let is_last_sor = i + 1 == n_sec;
            let mid_slot = i.saturating_sub(first_sor_idx) < a10_mid;
            if is_last_sor || mid_slot {
                if let Some(mut dup) = last_standard {
                    *global_index += 1;
                    dup.id = crate::domain::ids::KtpLessonId::new();
                    dup.global_index = *global_index;
                    dup.quarter_index = out.len() as i64 + 1;
                    out.push(dup);
                } else {
                    push_lesson(
                        &mut out,
                        quarter_id,
                        global_index,
                        sec_name.clone(),
                        LessonKind::Standard,
                        sec_name,
                        Vec::new(),
                    );
                }
            }
        }
    }

    push_lesson(
        &mut out,
        quarter_id,
        global_index,
        format!("Суммативное оценивание за {quarter_number} четверть"),
        LessonKind::Soch,
        "Суммативное оценивание за четверть".into(),
        Vec::new(),
    );

    for i in 0..rev_count {
        let topic = section_names
            .get(i % section_names.len())
            .cloned()
            .unwrap_or_else(|| format!("Повторение #{}", i + 1));
        push_lesson(
            &mut out,
            quarter_id,
            global_index,
            topic,
            LessonKind::Revision,
            "Повторение".into(),
            Vec::new(),
        );
    }

    while out.len() < target {
        let topic = section_names
            .first()
            .cloned()
            .unwrap_or_else(|| "Повторение".into());
        push_lesson(
            &mut out,
            quarter_id,
            global_index,
            topic,
            LessonKind::Revision,
            "Повторение".into(),
            Vec::new(),
        );
    }

    trim_to_target(&mut out, target, hours_per_week);
    reindex_quarter(&mut out, start_global);
    *global_index = start_global + out.len() as i64;
    out
}

fn reindex_quarter(out: &mut [KtpLesson], start_global: i64) {
    for (i, l) in out.iter_mut().enumerate() {
        l.quarter_index = i as i64 + 1;
        l.global_index = start_global + i as i64 + 1;
    }
}

/// Если контрольных срезов слишком много для нормы четверти — снимаем
/// лишние часы (сначала дубли тем, затем обычные уроки до последнего СОР,
/// затем лишние повторения сверх ч/нед). Буфер FR-2.2 и СОЧ не трогаем.
fn trim_to_target(out: &mut Vec<KtpLesson>, target: usize, hours_per_week: i64) {
    let min_rev = (hours_per_week as usize).max(1);
    while out.len() > target {
        let last_sor = out.iter().rposition(|l| l.lesson_type == LessonKind::Sor);
        let a10 = last_sor.map(|i| i + 1);

        let mut remove_at = out.iter().enumerate().rev().find_map(|(i, l)| {
            if l.lesson_type != LessonKind::Standard || a10 == Some(i) {
                return None;
            }
            let prev = i.checked_sub(1).and_then(|p| out.get(p));
            if prev.is_some_and(|p| {
                p.lesson_type == LessonKind::Standard
                    && p.topic_title == l.topic_title
                    && p.section_name == l.section_name
            }) {
                Some(i)
            } else {
                None
            }
        });

        if remove_at.is_none() {
            remove_at = out.iter().enumerate().rev().find_map(|(i, l)| {
                if l.lesson_type != LessonKind::Standard || a10 == Some(i) {
                    return None;
                }
                if last_sor.is_some_and(|s| i < s) {
                    Some(i)
                } else {
                    None
                }
            });
        }

        if remove_at.is_none() {
            let rev_indices: Vec<usize> = out
                .iter()
                .enumerate()
                .filter(|(_, l)| l.lesson_type == LessonKind::Revision)
                .map(|(i, _)| i)
                .collect();
            if rev_indices.len() > min_rev {
                remove_at = rev_indices.last().copied();
            }
        }

        match remove_at {
            Some(i) => {
                out.remove(i);
            }
            None => break,
        }
    }
}

/// Строит план КТП из полного документа ТУП ровно в годовую норму часов:
/// недели четверти × часы ТУП в неделю. СОР — после разделов, после
/// последнего СОР ровно один буфер (FR-2.2), после СОЧ — повторения ≥ ч/нед (FR-2.3).
pub fn generate_from_tup(doc: &FullTupDocument, p: &GenerateParams) -> KtpPlan {
    let objectives_by_code: std::collections::HashMap<String, &LearningObjective> = doc
        .objectives
        .iter()
        .map(|o| (o.code.replace(char::is_whitespace, ""), o))
        .collect();

    let hours_per_week = hours_per_week_of(doc, p);

    let mut plan = KtpPlan {
        id: crate::domain::ids::KtpPlanId::new(),
        subject_id: p.subject_id.clone(),
        grade: p.grade,
        language: doc.document.language.clone(),
        academic_year: p.academic_year.clone(),
        total_hours: 0,
        status: KtpStatus::Draft,
        created_at: now_iso(),
        updated_at: now_iso(),
        days_of_week: p
            .days_of_week
            .iter()
            .map(|d| d.to_string())
            .collect::<Vec<_>>()
            .join(","),
        quarters: Vec::new(),
    };

    let grade_quarters = doc
        .quarters
        .iter()
        .filter(|q| q.grade == p.grade)
        .collect::<Vec<_>>();
    let quarter_count = grade_quarters.len().max(4);

    let mut global_index: i64 = 0;

    for qn in 1..=quarter_count {
        let mut quarter = KtpQuarter {
            id: crate::domain::ids::KtpQuarterId::new(),
            ktp_id: plan.id,
            quarter_number: qn as i64,
            hours_per_week,
            lessons: Vec::new(),
        };
        let target = (weeks_of(qn as i64) * hours_per_week) as usize;
        quarter.lessons = if let Some(tq) = grade_quarters.iter().find(|q| q.quarter_number == qn as i64)
        {
            generate_quarter_lessons(
                tq,
                quarter.id,
                qn as i64,
                target,
                hours_per_week,
                &objectives_by_code,
                &mut global_index,
            )
        } else {
            fill_empty_quarter(
                quarter.id,
                qn as i64,
                target,
                hours_per_week,
                &mut global_index,
            )
        };
        plan.quarters.push(quarter);
    }

    plan.total_hours = global_index;
    plan
}

/// Проставляет физические даты всем урокам по календарю РК.
/// Для каждой четверти используется интервал [start_quarter; end_quarter],
/// уроки идут подряд по дням недели расписания; праздники пропускаются,
/// а если урок пришёлся на праздник — сдвигается на следующий доступный день.
pub fn assign_dates(plan: &mut KtpPlan, calendar: &RkCalendar) {
    let days: Vec<u32> = plan
        .days_of_week
        .split(',')
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .collect();
    if days.is_empty() {
        return;
    }

    let mut next_date_by_quarter: std::collections::HashMap<i64, NaiveDate> =
        std::collections::HashMap::new();

    for q in plan.quarters.iter_mut() {
        let qp = calendar.quarter(q.quarter_number as u32);
        let Some(qp) = qp else { continue };

        let mut cursor = next_date_by_quarter
            .remove(&q.quarter_number)
            .unwrap_or(qp.start);

        for lesson in q.lessons.iter_mut() {
            let d = calendar.next_lesson_date(cursor, &days);
            if let Some(d) = d {
                lesson.planned_date = Some(d);
                cursor = d + chrono::Duration::days(1);
            } else {
                lesson.planned_date = None;
            }
        }
        // Следующая встреча этой же четверти (не используется, но сохраняем).
        next_date_by_quarter.insert(q.quarter_number, cursor);
    }
}

/// Результат валидации инвариантов по всем четвертям плана.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvariantReport {
    pub valid: bool,
    pub checks: Vec<QuarterCheck>,
}

/// Проверка одной четверти.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuarterCheck {
    pub quarter_number: i64,
    /// FR-2.2: Index(Soch) - Index(Last_Sor) = 2.
    pub fr22_ok: bool,
    pub fr22_message: String,
    /// FR-2.3: TotalLessons_quarter - Index(Soch) >= HoursPerWeek.
    pub fr23_ok: bool,
    pub fr23_message: String,
}

/// Проверяет инварианты FR-2.2 и FR-2.3 для всех четвертей плана.
pub fn validate_invariants(plan: &KtpPlan) -> InvariantReport {
    let mut checks = Vec::new();
    let mut all_ok = true;

    for q in &plan.quarters {
        if q.lessons.is_empty() {
            continue;
        }
        let total = q.lessons.len() as usize;
        let hours = q.hours_per_week.max(1) as usize;

        let soch = q
            .lessons
            .iter()
            .enumerate()
            .filter(|(_, l)| l.lesson_type == LessonKind::Soch)
            .map(|(i, _)| i + 1)
            .min();
        let last_sor = q
            .lessons
            .iter()
            .enumerate()
            .filter(|(_, l)| l.lesson_type == LessonKind::Sor)
            .map(|(i, _)| i + 1)
            .max();

        let (fr22_ok, fr22_message) = match (soch, last_sor) {
            (Some(s), Some(sor)) => {
                if s - sor == 2 {
                    (true, "СОР → буфер → СОЧ: дистанция соблюдена".into())
                } else {
                    (
                        false,
                        format!("последний СОР на уроке {sor}, СОЧ на {s}: нужно ровно 1 промежуточный урок"),
                    )
                }
            }
            (Some(_), None) => (true, "СОЧ без СОР — инвариант не применим".into()),
            _ => (true, "нет контрольных срезов".into()),
        };

        let (fr23_ok, fr23_message) = match soch {
            Some(s) => {
                let buffer = total.saturating_sub(s);
                if buffer >= hours {
                    (true, format!("после СОЧ {buffer} уроков ≥ {hours} в неделю"))
                } else {
                    (
                        false,
                        format!("после СОЧ только {buffer} уроков, требуется ≥ {hours}"),
                    )
                }
            }
            None => (true, "нет СОЧ".into()),
        };

        if !fr22_ok || !fr23_ok {
            all_ok = false;
        }
        checks.push(QuarterCheck {
            quarter_number: q.quarter_number,
            fr22_ok,
            fr22_message,
            fr23_ok,
            fr23_message,
        });
    }

    InvariantReport {
        valid: all_ok,
        checks,
    }
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Datelike;
    use crate::domain::tup::{
        FullTupDocument, LearningObjective, TupDirection, TupDocument, TupQuarter, TupSection,
        TupSubjectHours, TupTopic,
    };

    fn stub_doc() -> FullTupDocument {
        let doc = TupDocument::new(
            "399".into(),
            "2022-09-16".into(),
            52,
            "mathematics".into(),
            "RU".into(),
            "5-6".into(),
            TupDirection::Common,
        );
        let mut quarters = Vec::new();
        for qn in 1..=4 {
            let mut q = TupQuarter::new(doc.id, 5, qn);
            let s1 = TupSection::new(q.id, "Раздел 1".into(), 0).with_topics(vec![
                TupTopic::new(crate::domain::ids::TupSectionId::new(), "Тема 1".into(), 0, vec!["5.1.1.1".into()]),
                TupTopic::new(crate::domain::ids::TupSectionId::new(), "Тема 2".into(), 1, vec!["5.1.1.2".into()]),
            ]);
            let s2 = TupSection::new(q.id, "Раздел 2".into(), 1).with_topics(vec![
                TupTopic::new(crate::domain::ids::TupSectionId::new(), "Тема 3".into(), 0, vec!["5.2.1.1".into()]),
            ]);
            q.sections = vec![s1, s2];
            quarters.push(q);
        }
        let objectives = vec![
            LearningObjective::new(doc.id, 5, 1, 1, 1, "уметь считать".into(), "5.1.1.1".into()),
            LearningObjective::new(doc.id, 5, 1, 1, 2, "уметь сравнивать".into(), "5.1.1.2".into()),
            LearningObjective::new(doc.id, 5, 2, 1, 1, "уметь складывать".into(), "5.2.1.1".into()),
        ];
        let doc_id = doc.id;
        FullTupDocument {
            document: doc,
            tasks: Vec::new(),
            hours: vec![TupSubjectHours::new(doc_id, 5, 2.0, 68)],
            objectives,
            quarters,
        }
    }

    fn params() -> GenerateParams {
        GenerateParams {
            subject_id: "mathematics".into(),
            grade: 5,
            academic_year: "2026-2027".into(),
            start_year: 2026,
            days_of_week: vec![2, 4], // вт/чт
        }
    }

    #[test]
    fn generates_plan_with_sections_topics_and_control_lessons() {
        let doc = stub_doc();
        let plan = generate_from_tup(&doc, &params());
        assert_eq!(plan.quarters.len(), 4);
        // Норма ТУП: 2 ч/нед × недели 8/8/10/8.
        let expected = [16, 16, 20, 16];
        for (q, n) in plan.quarters.iter().zip(expected) {
            assert_eq!(q.lessons.len(), n, "четверть {}", q.quarter_number);
        }
        // Первая четверть: глобальные индексы возрастают.
        let g: Vec<i64> = plan.quarters[0].lessons.iter().map(|l| l.global_index).collect();
        assert!(g.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn generated_plan_passes_invariants() {
        let doc = stub_doc();
        let plan = generate_from_tup(&doc, &params());
        let report = validate_invariants(&plan);
        assert!(report.valid, "инварианты нарушены: {:?}", report.checks);
    }

    #[test]
    fn dates_are_assigned_and_skip_holidays() {
        let doc = stub_doc();
        let mut plan = generate_from_tup(&doc, &params());
        let cal = RkCalendar::for_academic_year(2026);
        assign_dates(&mut plan, &cal);
        for q in &plan.quarters {
            for l in &q.lessons {
                let d = l.planned_date.expect("дата должна быть назначена");
                assert!(!cal.is_holiday(d), "праздник в расписании: {d}");
                assert!(
                    d.weekday().number_from_monday() == 2 || d.weekday().number_from_monday() == 4,
                    "не день расписания: {d}"
                );
            }
        }
    }

    #[test]
    fn fr22_violation_is_reported() {
        let doc = stub_doc();
        let mut plan = generate_from_tup(&doc, &params());
        // Нарушаем: убираем буфер между СОР и СОЧ (последний урок перед СОЧ — СОР).
        for q in plan.quarters.iter_mut() {
            if let Some(soch_idx) = q.lessons.iter().position(|l| l.lesson_type == LessonKind::Soch) {
                if soch_idx > 0 {
                    q.lessons[soch_idx - 1].lesson_type = LessonKind::Sor;
                }
            }
        }
        let report = validate_invariants(&plan);
        assert!(!report.valid);
        assert!(report.checks.iter().any(|c| !c.fr22_ok));
    }

    #[test]
    fn academic_year_and_hours_are_set() {
        let doc = stub_doc();
        let plan = generate_from_tup(&doc, &params());
        assert_eq!(plan.academic_year, "2026-2027");
        assert_eq!(plan.subject_id, "mathematics");
        assert_eq!(plan.status, KtpStatus::Draft);
        assert!(plan.total_hours > 0);
        assert_eq!(plan.quarters[0].hours_per_week, 2);
        assert_eq!(plan.total_hours, 68);
    }

    #[test]
    fn uses_tup_hours_even_if_schedule_has_fewer_days() {
        let mut doc = stub_doc();
        doc.hours[0] = TupSubjectHours::new(doc.document.id, 5, 4.0, 136);
        let plan = generate_from_tup(&doc, &params());
        assert_eq!(plan.quarters[0].hours_per_week, 4);
        assert_eq!(plan.quarters[0].lessons.len(), 32);
        assert_eq!(plan.quarters[2].lessons.len(), 40);
        assert_eq!(plan.total_hours, 136);
        let report = validate_invariants(&plan);
        assert!(report.valid, "инварианты нарушены: {:?}", report.checks);
    }

    #[test]
    fn crowded_dsp_still_hits_hour_norm() {
        let mut doc = stub_doc();
        let qid = doc.quarters[0].id;
        doc.quarters[0].sections = (1..=20)
            .map(|i| {
                TupSection::new(qid, format!("Раздел {i}"), i - 1).with_topics(vec![TupTopic::new(
                    crate::domain::ids::TupSectionId::new(),
                    format!("Тема {i}"),
                    0,
                    vec![format!("5.1.1.{i}")],
                )])
            })
            .collect();
        let plan = generate_from_tup(&doc, &params());
        assert_eq!(plan.quarters[0].lessons.len(), 16);
        assert_eq!(plan.total_hours, 68);
        let report = validate_invariants(&plan);
        assert!(report.valid, "инварианты нарушены: {:?}", report.checks);
    }

    #[test]
    fn each_objective_becomes_its_own_lesson() {
        let mut doc = stub_doc();
        // Первой теме добавляем вторую цель: 5.1.1.1 и 5.1.1.2 — две цели.
        doc.quarters[0].sections[0].topics[0].objective_codes.push("5.1.1.2".into());
        doc.objectives.push(LearningObjective::new(
            doc.document.id, 5, 1, 1, 2, "уметь сравнивать".into(), "5.1.1.2".into(),
        ));

        let plan = generate_from_tup(&doc, &params());
        let q0 = &plan.quarters[0];

        // Свободные часы позволяют разнести две цели первой темы на два урока.
        let standard: Vec<&KtpLesson> = q0
            .lessons
            .iter()
            .filter(|l| l.lesson_type == LessonKind::Standard)
            .collect();
        assert!(standard.len() >= 4, "ожидались тема1×2 + тема2 + тема3, получили {}", standard.len());
        assert_eq!(q0.lessons.len(), 16);

        let first = &standard[0];
        let second = &standard[1];
        assert_eq!(first.topic_title, "Тема 1");
        assert_eq!(second.topic_title, "Тема 1", "тема повторяется на продолжении");
        assert_eq!(first.objectives.len(), 1);
        assert_eq!(second.objectives.len(), 1);
        assert_eq!(first.objectives[0].code, "5.1.1.1");
        assert_eq!(second.objectives[0].code, "5.1.1.2");
        assert_eq!(second.objectives[0].description, "уметь сравнивать");

        // Инварианты остаются в силе при новом раскладе.
        let report = validate_invariants(&plan);
        assert!(report.valid, "инварианты нарушены: {:?}", report.checks);
    }

    #[test]
    fn sor_is_followed_by_duplicate_of_last_lesson_and_no_revision_before_soch() {
        let doc = stub_doc();
        let plan = generate_from_tup(&doc, &params());

        for q in &plan.quarters {
            for (i, lesson) in q.lessons.iter().enumerate() {
                if lesson.lesson_type == LessonKind::Sor {
                    let next = q.lessons.get(i + 1).expect("СОР должен иметь следующий урок");
                    let prev_standard = q.lessons[..i]
                        .iter()
                        .rev()
                        .find(|l| l.lesson_type == LessonKind::Standard)
                        .expect("перед СОР должен быть обычный урок");
                    // A10: сразу после СОР — дубликат последнего обычного урока раздела.
                    assert_eq!(next.lesson_type, LessonKind::Standard);
                    assert_eq!(next.topic_title, prev_standard.topic_title);
                    assert_eq!(next.objectives.len(), prev_standard.objectives.len());
                }
            }
            // Между последним СОР и СОЧ нет повторений (A10).
            let sor_positions: Vec<usize> = q
                .lessons
                .iter()
                .enumerate()
                .filter(|(_, l)| l.lesson_type == LessonKind::Sor)
                .map(|(i, _)| i)
                .collect();
            let soch_pos = q.lessons.iter().position(|l| l.lesson_type == LessonKind::Soch);
            if let (Some(&last_sor), Some(soch)) = (sor_positions.last(), soch_pos) {
                for lesson in &q.lessons[last_sor + 1..soch] {
                    assert_ne!(lesson.lesson_type, LessonKind::Revision, "между СОР и СОЧ нет повторений");
                }
                // FR-2.2: дистанция ровно 2 (СОР → дубликат → СОЧ).
                assert_eq!(soch - last_sor, 2);
            }
        }
    }

    #[test]
    fn tail_repetitions_use_section_names() {
        let doc = stub_doc();
        let plan = generate_from_tup(&doc, &params());
        // В stub-четверти 2 раздела → 2 хвостовых повторения с их названиями.
        let q0 = &plan.quarters[0];
        let revisions: Vec<&KtpLesson> = q0
            .lessons
            .iter()
            .filter(|l| l.lesson_type == LessonKind::Revision)
            .collect();
        assert_eq!(revisions.len(), 2);
        assert_eq!(revisions[0].topic_title, "Раздел 1");
        assert_eq!(revisions[1].topic_title, "Раздел 2");
    }

    #[test]
    fn single_section_quarter_duplicates_tail_repetition() {
        let mut doc = stub_doc();
        // Сводим первую четверть к одному разделу.
        doc.quarters[0].sections.truncate(1);
        let plan = generate_from_tup(&doc, &params());
        let q0 = &plan.quarters[0];
        let revisions: Vec<&KtpLesson> = q0
            .lessons
            .iter()
            .filter(|l| l.lesson_type == LessonKind::Revision)
            .collect();
        // max(2, 1) = 2 повторения с названием единственного раздела (дубль).
        assert_eq!(revisions.len(), 2);
        assert_eq!(revisions[0].topic_title, "Раздел 1");
        assert_eq!(revisions[1].topic_title, "Раздел 1");
    }

    #[test]
    fn soch_has_full_name() {
        let doc = stub_doc();
        let plan = generate_from_tup(&doc, &params());
        let soch = plan.quarters[0]
            .lessons
            .iter()
            .find(|l| l.lesson_type == LessonKind::Soch)
            .expect("СОЧ должен быть в четверти");
        assert_eq!(soch.topic_title, "Суммативное оценивание за 1 четверть");
    }
}
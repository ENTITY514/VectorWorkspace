//! Сервис КТП (Фаза 4): генерация плана из ТУП, авторасчёт дат по
//! производственному календарю РК, валидация инвариантов оценивания.
//! Чистая логика — без БД; персистентность в `repo_ktp`.

use chrono::NaiveDate;

use crate::domain::invariants::LessonKind;
use crate::domain::ktp::{KtpLesson, KtpPlan, KtpQuarter, KtpStatus};
use crate::domain::rk_calendar::RkCalendar;
use crate::domain::tup::FullTupDocument;

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

/// Строит план КТП из полного документа ТУП: темы ДСП (П3) становятся уроками,
/// цели подставляются из матрицы (П2) по коду. СОР — после каждого раздела,
/// СОЧ — в конце четверти, за ним буфер повторений (FR-2.3).
pub fn generate_from_tup(doc: &FullTupDocument, p: &GenerateParams) -> KtpPlan {
    let objectives_by_code = doc
        .objectives
        .iter()
        .map(|o| (o.code.replace(char::is_whitespace, ""), o.code.clone()))
        .collect::<std::collections::HashMap<_, _>>();

    let hours_per_week = doc
        .hours
        .iter()
        .find(|h| h.grade == p.grade)
        .map(|h| h.hours_per_week.round() as i64)
        .unwrap_or(2)
        .max(1);

    let mut plan = KtpPlan {
        id: crate::domain::ids::KtpPlanId::new(),
        subject_id: p.subject_id.clone(),
        grade: p.grade,
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

    // Четверти ТУП для этого класса; если ДСП для класса пуст/обрезан —
    // создаём 4 пустых четверти, чтобы план был валиден.
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

        if let Some(tq) = grade_quarters.iter().find(|q| q.quarter_number == qn as i64) {
            for section in &tq.sections {
                for topic in &section.topics {
                    global_index += 1;
                    let mut lesson = KtpLesson::new(
                        quarter.id,
                        global_index,
                        quarter.lessons.len() as i64 + 1,
                        topic.name.clone(),
                        LessonKind::Standard,
                    );
                    lesson.objective_codes = topic
                        .objective_codes
                        .iter()
                        .map(|c| {
                            objectives_by_code
                                .get(&c.replace(char::is_whitespace, ""))
                                .cloned()
                                .unwrap_or_else(|| c.clone())
                        })
                        .collect();
                    quarter.lessons.push(lesson);
                }
                // СОР после каждого раздела (включая последний), чтобы
                // последний СОР оказался ровно за 1 урок до СОЧ (FR-2.2).
                global_index += 1;
                quarter.lessons.push(KtpLesson::new(
                    quarter.id,
                    global_index,
                    quarter.lessons.len() as i64 + 1,
                    format!("СОР по разделу «{}»", section.name),
                    LessonKind::Sor,
                ));
            }

            // Буфер ровно в 1 урок между последним СОР и СОЧ (FR-2.2).
            global_index += 1;
            quarter.lessons.push(KtpLesson::new(
                quarter.id,
                global_index,
                quarter.lessons.len() as i64 + 1,
                "Повторение по разделу".into(),
                LessonKind::Revision,
            ));

            // СОЧ в конце четверти.
            global_index += 1;
            quarter.lessons.push(KtpLesson::new(
                quarter.id,
                global_index,
                quarter.lessons.len() as i64 + 1,
                format!("СОЧ за {} четверть", qn),
                LessonKind::Soch,
            ));

            // Буфер повторений после СОЧ: не менее недельной нагрузки (FR-2.3).
            for i in 0..hours_per_week {
                global_index += 1;
                quarter.lessons.push(KtpLesson::new(
                    quarter.id,
                    global_index,
                    quarter.lessons.len() as i64 + 1,
                    format!("Повторение #{}", i + 1),
                    LessonKind::Revision,
                ));
            }
        }

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
        // В каждой четверти: 3 темы + 2 СОР + 1 буфер + СОЧ + 2 повторения = 9 уроков.
        for q in &plan.quarters {
            assert_eq!(q.lessons.len(), 9);
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
    }
}
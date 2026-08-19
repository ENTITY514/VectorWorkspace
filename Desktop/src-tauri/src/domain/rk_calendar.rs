//! Производственный календарь Республики Казахстан (домен, без БД и UI).
//! Начало учебного года — 1 сентября; 4 четверти, каникулы и официальные
//! праздники. Дата-движок разделяет логические индексы уроков и физический
//! календарь (FR-2.4 адаптивный сдвиг).

use chrono::{Datelike, NaiveDate, Weekday};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Числовой день недели для расписания: 1 = Понедельник … 7 = Воскресенье
/// (совпадает с `chrono::Datelike::iso_weekday().number_from_monday()`).
pub type WeekdayNumber = u32;

/// Границы четверти учебного года.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuarterPeriod {
    pub quarter_number: u32,
    pub start: NaiveDate,
    pub end: NaiveDate,
}

/// Период каникул.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VacationPeriod {
    pub name: String,
    pub start: NaiveDate,
    pub end: NaiveDate,
}

/// Производственный календарь РК на учебный год.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RkCalendar {
    /// "2026-2027".
    pub academic_year: String,
    /// Четыре четверти (1 сентября — 31 мая).
    pub quarters: Vec<QuarterPeriod>,
    /// Каникулы между четвертями и летние.
    pub vacations: Vec<VacationPeriod>,
    /// Официальные праздничные даты учебного года (физические даты).
    pub holidays: BTreeSet<NaiveDate>,
}

/// Официальные праздники РК (число-месяц; применяются к любому году).
const FIXED_HOLIDAYS: &[(u32, u32)] = &[
    (1, 1),
    (1, 2),
    (1, 7),
    (3, 8),
    (3, 21),
    (3, 22),
    (3, 23),
    (5, 1),
    (5, 7),
    (5, 9),
    (7, 6),
    (8, 30),
    (10, 25),
    (12, 16),
];

impl RkCalendar {
    /// Строит календарь на учебный год, начинающийся 1 сентября `start_year`
    /// (например 2026 → год "2026-2027").
    pub fn for_academic_year(start_year: i32) -> Self {
        let academic_year = format!("{}-{}", start_year, start_year + 1);

        let q1 = QuarterPeriod {
            quarter_number: 1,
            start: NaiveDate::from_ymd_opt(start_year, 9, 1).expect("1 сентября"),
            end: NaiveDate::from_ymd_opt(start_year, 10, 25).expect("25 октября"),
        };
        let q2 = QuarterPeriod {
            quarter_number: 2,
            start: NaiveDate::from_ymd_opt(start_year, 11, 4).expect("4 ноября"),
            end: NaiveDate::from_ymd_opt(start_year, 12, 27).expect("27 декабря"),
        };
        let q3 = QuarterPeriod {
            quarter_number: 3,
            start: NaiveDate::from_ymd_opt(start_year + 1, 1, 8).expect("8 января"),
            end: NaiveDate::from_ymd_opt(start_year + 1, 3, 21).expect("21 марта"),
        };
        let q4 = QuarterPeriod {
            quarter_number: 4,
            start: NaiveDate::from_ymd_opt(start_year + 1, 4, 1).expect("1 апреля"),
            end: NaiveDate::from_ymd_opt(start_year + 1, 5, 31).expect("31 мая"),
        };

        let vacations = vec![
            VacationPeriod {
                name: "Осенние".into(),
                start: NaiveDate::from_ymd_opt(start_year, 10, 26).expect("26 октября"),
                end: NaiveDate::from_ymd_opt(start_year, 11, 3).expect("3 ноября"),
            },
            VacationPeriod {
                name: "Зимние".into(),
                start: NaiveDate::from_ymd_opt(start_year, 12, 28).expect("28 декабря"),
                end: NaiveDate::from_ymd_opt(start_year + 1, 1, 7).expect("7 января"),
            },
            VacationPeriod {
                name: "Весенние".into(),
                start: NaiveDate::from_ymd_opt(start_year + 1, 3, 22).expect("22 марта"),
                end: NaiveDate::from_ymd_opt(start_year + 1, 3, 31).expect("31 марта"),
            },
            VacationPeriod {
                name: "Летние".into(),
                start: NaiveDate::from_ymd_opt(start_year + 1, 6, 1).expect("1 июня"),
                end: NaiveDate::from_ymd_opt(start_year + 1, 8, 31).expect("31 августа"),
            },
        ];

        let mut holidays = BTreeSet::new();
        for (month, day) in FIXED_HOLIDAYS {
            let y = if *month < 8 { start_year + 1 } else { start_year };
            if let Some(d) = NaiveDate::from_ymd_opt(y, *month, *day) {
                holidays.insert(d);
            }
        }

        Self {
            academic_year,
            quarters: vec![q1, q2, q3, q4],
            vacations,
            holidays,
        }
    }

    /// Границы заданной четверти.
    pub fn quarter(&self, quarter_number: u32) -> Option<QuarterPeriod> {
        self.quarters
            .iter()
            .find(|q| q.quarter_number == quarter_number)
            .copied()
    }

    /// Праздник ли это (без учёта каникул)?
    pub fn is_holiday(&self, date: NaiveDate) -> bool {
        self.holidays.contains(&date)
    }

    /// Каникулы ли это?
    pub fn is_vacation(&self, date: NaiveDate) -> bool {
        self.vacations
            .iter()
            .any(|v| date >= v.start && date <= v.end)
    }

    /// Учебный ли день: не выходной (не суббота/воскресенье), не праздник, не каникулы.
    pub fn is_school_day(&self, date: NaiveDate) -> bool {
        let wd = date.weekday();
        wd != Weekday::Sat
            && wd != Weekday::Sun
            && !self.is_holiday(date)
            && !self.is_vacation(date)
    }

    /// Ближайшая доступная дата урока, начиная с `from` (включительно):
    /// день недели из расписания + не праздник + не каникулы.
    pub fn next_lesson_date(
        &self,
        from: NaiveDate,
        days_of_week: &[WeekdayNumber],
    ) -> Option<NaiveDate> {
        if days_of_week.is_empty() {
            return None;
        }
        let mut d = from;
        let horizon = from + chrono::Duration::days(45);
        while d <= horizon {
            let num = d.weekday().number_from_monday();
            if days_of_week.contains(&num) && !self.is_holiday(d) && !self.is_vacation(d) {
                return Some(d);
            }
            d = d.succ_opt().unwrap_or(d);
        }
        None
    }
}

/// Рассчитывает физические даты уроков в интервале [start; end] по дням недели
/// расписания, пропуская праздники (каникулы по умолчанию тоже не считаются
/// учебными днями — проверяется по календарю, если он передан).
///
/// Возвращает список дат в хронологическом порядке. Число дат = числу уроков,
/// попадающих в интервал по дням недели.
pub fn calculate_lesson_dates(
    start: NaiveDate,
    end: NaiveDate,
    days_of_week: &[WeekdayNumber],
    holidays: &BTreeSet<NaiveDate>,
) -> Vec<NaiveDate> {
    let mut out = Vec::new();
    if days_of_week.is_empty() {
        return out;
    }
    let mut d = start;
    while d <= end {
        let num = d.weekday().number_from_monday();
        if days_of_week.contains(&num) && !holidays.contains(&d) {
            out.push(d);
        }
        d = d.succ_opt().unwrap_or(d);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cal() -> RkCalendar {
        RkCalendar::for_academic_year(2026)
    }

    #[test]
    fn calendar_has_four_quarters_and_vacations() {
        let c = cal();
        assert_eq!(c.quarters.len(), 4);
        assert_eq!(c.vacations.len(), 4);
        assert_eq!(c.academic_year, "2026-2027");
        assert_eq!(c.quarter(1).unwrap().start, NaiveDate::from_ymd_opt(2026, 9, 1).unwrap());
        assert_eq!(c.quarter(4).unwrap().end, NaiveDate::from_ymd_opt(2027, 5, 31).unwrap());
    }

    #[test]
    fn holidays_are_detected() {
        let c = cal();
        // День Республики (в учебном году 2026).
        let rep = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
        assert!(c.is_holiday(rep));
        // Наурыз (весна 2027).
        let nauryz = NaiveDate::from_ymd_opt(2027, 3, 22).unwrap();
        assert!(c.is_holiday(nauryz));
        // 16 декабря (в 2026).
        assert!(c.is_holiday(NaiveDate::from_ymd_opt(2026, 12, 16).unwrap()));
        // Обычный будний день — не праздник.
        assert!(!c.is_holiday(NaiveDate::from_ymd_opt(2026, 9, 2).unwrap()));
    }

    #[test]
    fn vacation_detection() {
        let c = cal();
        // Осенние каникулы.
        assert!(c.is_vacation(NaiveDate::from_ymd_opt(2026, 11, 2).unwrap()));
        // Учебный день в четверти — не каникулы.
        assert!(!c.is_vacation(NaiveDate::from_ymd_opt(2026, 9, 10).unwrap()));
    }

    #[test]
    fn lesson_dates_skip_weekends_and_holidays() {
        // Сентябрь 2026: 1 сентября — вторник, 2 — среда.
        let start = NaiveDate::from_ymd_opt(2026, 9, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 9, 30).unwrap();
        let holidays = cal().holidays.clone();
        // Вторник и четверг.
        let dates = calculate_lesson_dates(start, end, &[2, 4], &holidays);
        // Все даты — вторник или четверг.
        for d in &dates {
            assert!(d.weekday().number_from_monday() == 2 || d.weekday().number_from_monday() == 4);
        }
        // Ни одна — не праздник.
        for d in &dates {
            assert!(!holidays.contains(d), "праздник не должен попасть в расписание: {d}");
        }
    }

    #[test]
    fn republic_day_oct25_is_skipped_and_shifted() {
        // 25 октября 2026 — воскресенье (проверим сам сдвиг на любой год с будним 25).
        let c = cal();
        // Если 25 октября — праздник, next_lesson_date с этого дня идёт вперёд.
        let rep = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
        // Расписание «каждый день недели», чтобы первый же будний день был кандидатом.
        let next = c.next_lesson_date(rep, &[1, 2, 3, 4, 5, 6, 7]);
        assert!(next.is_some());
        let d = next.unwrap();
        assert!(!c.is_holiday(d));
        assert!(d >= rep);
    }

    #[test]
    fn nauryz_is_skipped() {
        let c = cal();
        for day in 21..=23 {
            let d = NaiveDate::from_ymd_opt(2027, 3, day).unwrap();
            assert!(c.is_holiday(d), "21-23 марта — праздник Наурыз: {d}");
        }
    }

    #[test]
    fn next_lesson_date_respects_days_of_week() {
        let c = cal();
        // Вторник 2026-09-01, среда 02, четверг 03.
        let from = NaiveDate::from_ymd_opt(2026, 9, 1).unwrap();
        let d = c.next_lesson_date(from, &[4]).unwrap();
        assert_eq!(d, NaiveDate::from_ymd_opt(2026, 9, 3).unwrap());
    }

    #[test]
    fn empty_days_of_week_yields_empty() {
        let c = cal();
        assert_eq!(
            calculate_lesson_dates(
                NaiveDate::from_ymd_opt(2026, 9, 1).unwrap(),
                NaiveDate::from_ymd_opt(2026, 9, 30).unwrap(),
                &[],
                &c.holidays
            ),
            Vec::<NaiveDate>::new()
        );
    }
}

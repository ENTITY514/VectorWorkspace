//! Ценности «Адал азамат»: код ценности по месяцу плановой даты урока.
//! Коды и тексты — миграция `0026_adal_azamat_values.sql` (id = code).

use chrono::{Datelike, NaiveDate};
use std::str::FromStr;

/// Код ценности для месяца (1–12); летние месяцы 6–8 и прочее — None.
pub fn value_code_for_month(month: u32) -> Option<&'static str> {
    match month {
        9 | 4 => Some("aa_diligence_professionalism"),
        10 | 3 => Some("aa_independence_patriotism"),
        11 => Some("aa_justice_responsibility"),
        12 | 5 => Some("aa_unity_solidarity"),
        1 => Some("aa_law_order"),
        2 => Some("aa_creation_innovation"),
        _ => None,
    }
}

/// Код ценности для даты в формате "YYYY-MM-DD"; не разобранная дата — None.
pub fn value_code_for_date(iso_date: &str) -> Option<&'static str> {
    let date = NaiveDate::from_str(iso_date).ok()?;
    value_code_for_month(date.month())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn month_calendar_matches_design() {
        assert_eq!(value_code_for_month(9), Some("aa_diligence_professionalism"));
        assert_eq!(value_code_for_month(10), Some("aa_independence_patriotism"));
        assert_eq!(value_code_for_month(11), Some("aa_justice_responsibility"));
        assert_eq!(value_code_for_month(12), Some("aa_unity_solidarity"));
        assert_eq!(value_code_for_month(1), Some("aa_law_order"));
        assert_eq!(value_code_for_month(2), Some("aa_creation_innovation"));
        assert_eq!(value_code_for_month(3), Some("aa_independence_patriotism"));
        assert_eq!(value_code_for_month(4), Some("aa_diligence_professionalism"));
        assert_eq!(value_code_for_month(5), Some("aa_unity_solidarity"));
    }

    #[test]
    fn summer_and_out_of_range_months_are_none() {
        for m in [0, 6, 7, 8, 13] {
            assert_eq!(value_code_for_month(m), None, "месяц {m}");
        }
    }

    #[test]
    fn date_maps_iso_month() {
        assert_eq!(
            value_code_for_date("2026-09-01"),
            Some("aa_diligence_professionalism")
        );
        assert_eq!(value_code_for_date("2027-02-14"), Some("aa_creation_innovation"));
        // Июль — каникулы.
        assert_eq!(value_code_for_date("2027-07-01"), None);
    }

    #[test]
    fn invalid_dates_are_none() {
        assert_eq!(value_code_for_date(""), None);
        assert_eq!(value_code_for_date("15.09.2026"), None);
        assert_eq!(value_code_for_date("2026-13-01"), None);
        assert_eq!(value_code_for_date("сентябрь"), None);
    }
}

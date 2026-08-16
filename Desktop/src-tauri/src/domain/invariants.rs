//! Инварианты домена (чистая логика, без БД и UI).
//! Вызываются из карантинного буфера ДО касания репозитория.
//! Инварианты используются контуром КТП (Фаза 4+); до того — dead_code допустим.
#![allow(dead_code)]

use std::cmp::Ordering;

/// Типы уроков КТП.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LessonKind {
    Standard,
    Sor,
    Soch,
    Revision,
}

impl LessonKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            LessonKind::Standard => "Standard",
            LessonKind::Sor => "Sor",
            LessonKind::Soch => "Soch",
            LessonKind::Revision => "Revision",
        }
    }
}

/// FR-2.2: между последним СОР перед СОЧ и СОЧ обязан быть ровно 1 промежуточный урок.
/// То есть `index(Soch) - index(Last_Sor) = 2`.
///
/// Возвращает результат проверки + имя нарушенного правила (для диагностики).
pub fn check_fr22(
    lessons: &[(usize, LessonKind)],
) -> Result<(), &'static str> {
    // Первый СОЧ в хронологическом порядке.
    let first_soch = lessons
        .iter()
        .filter(|(_, kind)| *kind == LessonKind::Soch)
        .map(|(idx, _)| *idx)
        .min();

    let Some(first_soch) = first_soch else {
        // СОЧ нет — инвариант не применим.
        return Ok(());
    };

    // Последний СОР ПЕРЕД СОЧ.
    let last_sor_before_soch = lessons
        .iter()
        .enumerate()
        .filter(|(_, (i, kind))| *i < first_soch && *kind == LessonKind::Sor)
        .map(|(_, (idx, _))| *idx)
        .max();

    let Some(last_sor) = last_sor_before_soch else {
        // СОЧ есть, но СОР перед ним нет — допустимо (проверяется другими правилами).
        return Ok(());
    };

    if first_soch - last_sor == 2 {
        Ok(())
    } else {
        Err("FR-2.2: между последним СОР перед СОЧ и СОЧ должно быть ровно 1 промежуточный урок")
    }
}

/// FR-2.3: общее число уроков четверти после СОЧ не должно быть меньше
/// недельной нагрузки (на СОЧ остаётся не меньше часов, чем уроков в неделю).
pub fn check_fr23(total_lessons: usize, index_soch: usize, hours_per_week: usize) -> bool {
    total_lessons.saturating_sub(index_soch) >= hours_per_week
}

/// Хронометраж КСП: сумма длительностей этапов обязана точно совпасть с эталоном урока.
pub fn check_timing(durations_minutes: &[u32], reference_minutes: u32) -> bool {
    durations_minutes.iter().sum::<u32>() == reference_minutes
}

/// Сравнение для отчётов (утилита диагностики, не инвариант).
#[allow(dead_code)]
fn cmp_lesson(a: &(usize, LessonKind), b: &(usize, LessonKind)) -> Ordering {
    a.0.cmp(&b.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seq(kinds: &[LessonKind]) -> Vec<(usize, LessonKind)> {
        kinds.iter().copied().enumerate().collect()
    }

    #[test]
    fn fr22_ok_with_exact_one_buffer() {
        // Индексы: 0..2 уроки, СОР на 2, буфер 3, СОЧ на 4.
        let mut l = seq(&[
            LessonKind::Standard,
            LessonKind::Standard,
            LessonKind::Standard,
            LessonKind::Sor,
            LessonKind::Standard,
            LessonKind::Soch,
        ]);
        // Убедимся, что перенос индексов не важен: проверяем расстоянием.
        assert!(check_fr22(&l).is_ok());
        // Явно: СОР на idx 3, СОЧ на idx 5 → разница 2.
        l = vec![
            (0, LessonKind::Standard),
            (1, LessonKind::Standard),
            (2, LessonKind::Standard),
            (3, LessonKind::Sor),
            (4, LessonKind::Standard),
            (5, LessonKind::Soch),
        ];
        assert!(check_fr22(&l).is_ok());
    }

    #[test]
    fn fr22_violated_without_buffer() {
        let l = vec![
            (0, LessonKind::Standard),
            (1, LessonKind::Standard),
            (2, LessonKind::Sor),
            (3, LessonKind::Soch),
        ];
        assert_eq!(
            check_fr22(&l),
            Err("FR-2.2: между последним СОР перед СОЧ и СОЧ должно быть ровно 1 промежуточный урок")
        );
    }

    #[test]
    fn fr22_uses_last_sor_before_soch() {
        // Ранний СОР не должен ломать инвариант, если после него есть СОЧ и буфер.
        let l = vec![
            (0, LessonKind::Sor),
            (1, LessonKind::Standard),
            (2, LessonKind::Sor),
            (3, LessonKind::Standard),
            (4, LessonKind::Soch),
        ];
        // Последний СОР перед СОЧ — idx 2, СОЧ — idx 4, разница 2 → ок.
        assert!(check_fr22(&l).is_ok());
    }

    #[test]
    fn fr22_no_soch_is_ok() {
        let l = seq(&[LessonKind::Sor, LessonKind::Standard]);
        assert!(check_fr22(&l).is_ok());
    }

    #[test]
    fn fr23_ok() {
        assert!(check_fr23(6, 4, 2)); // 6-4=2 >= 2
    }

    #[test]
    fn fr23_violated() {
        assert!(!check_fr23(5, 4, 2)); // 5-4=1 < 2
    }

    #[test]
    fn timing_exact_match() {
        assert!(check_timing(&[10, 5, 15, 10, 5], 45));
    }

    #[test]
    fn timing_mismatch() {
        assert!(!check_timing(&[10, 5, 15, 10, 4], 45));
        assert!(!check_timing(&[10, 5, 15, 10, 6], 45));
    }

    #[test]
    fn timing_reference_40() {
        assert!(check_timing(&[5, 5, 10, 10, 10], 40));
    }
}

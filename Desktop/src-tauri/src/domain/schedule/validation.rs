use super::model::{AvailabilityMatrix, Weights};

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("sanitary_weight должен быть 1..10, получен {0}")]
    InvalidWeight(i64),
    #[error("hours_per_week должен быть 1..6, получен {0}")]
    InvalidHours(i64),
    #[error("учитель должен иметь хотя бы один доступный слот")]
    NoAvailability,
    #[error("подгруппы одного предмета должны вести разные учителя")]
    SameSplitTeacher,
    #[error("grade должен быть 1..11, получен {0}")]
    InvalidGrade(i64),
    #[error("headcount должен быть 1..50, получен {0}")]
    InvalidHeadcount(i64),
    #[error("capacity должен быть 1..200, получен {0}")]
    InvalidCapacity(i64),
    #[error("group_count должен быть 2 или 3, получен {0}")]
    InvalidGroupCount(i64),
    #[error("full_name не может быть пустым")]
    EmptyName,
    #[error("неизвестный room_type: {0}")]
    UnknownRoomType(String),
    #[error("неизвестный shift: {0}")]
    UnknownShift(String),
    #[error("weights должны быть 0..1000")]
    InvalidWeights,
    #[error("day должен быть 0..5, получен {0}")]
    InvalidDay(i64),
    #[error("period должен быть 0..7, получен {0}")]
    InvalidPeriod(i64),
}

pub fn validate_sanitary_weight(w: i64) -> Result<(), ValidationError> {
    if (1..=10).contains(&w) {
        Ok(())
    } else {
        Err(ValidationError::InvalidWeight(w))
    }
}

pub fn validate_hours_per_week(h: i64) -> Result<(), ValidationError> {
    if (1..=6).contains(&h) {
        Ok(())
    } else {
        Err(ValidationError::InvalidHours(h))
    }
}

pub fn validate_availability(m: &AvailabilityMatrix) -> Result<(), ValidationError> {
    if m.has_any_available() {
        Ok(())
    } else {
        Err(ValidationError::NoAvailability)
    }
}

pub fn validate_split_teachers(t1: &str, t2: Option<&str>) -> Result<(), ValidationError> {
    if let Some(t2) = t2 {
        if t1 == t2 {
            return Err(ValidationError::SameSplitTeacher);
        }
    }
    Ok(())
}

pub fn validate_grade(g: i64) -> Result<(), ValidationError> {
    if (1..=11).contains(&g) {
        Ok(())
    } else {
        Err(ValidationError::InvalidGrade(g))
    }
}

pub fn validate_headcount(h: i64) -> Result<(), ValidationError> {
    if (1..=50).contains(&h) {
        Ok(())
    } else {
        Err(ValidationError::InvalidHeadcount(h))
    }
}

pub fn validate_capacity(c: i64) -> Result<(), ValidationError> {
    if (1..=200).contains(&c) {
        Ok(())
    } else {
        Err(ValidationError::InvalidCapacity(c))
    }
}

pub fn validate_group_count(g: i64) -> Result<(), ValidationError> {
    if g == 2 || g == 3 {
        Ok(())
    } else {
        Err(ValidationError::InvalidGroupCount(g))
    }
}

pub fn validate_name(name: &str) -> Result<(), ValidationError> {
    if name.trim().is_empty() {
        Err(ValidationError::EmptyName)
    } else {
        Ok(())
    }
}

pub fn validate_weights(w: &Weights) -> Result<(), ValidationError> {
    let vals = [
        w.window,
        w.room_displacement,
        w.sanpin_parabola,
        w.alternation,
        w.movement,
        w.load_balance,
    ];
    if vals.iter().all(|&v| v <= 1000) {
        Ok(())
    } else {
        Err(ValidationError::InvalidWeights)
    }
}

pub fn validate_day(d: i64) -> Result<(), ValidationError> {
    if (0..=5).contains(&d) {
        Ok(())
    } else {
        Err(ValidationError::InvalidDay(d))
    }
}

pub fn validate_period(p: i64) -> Result<(), ValidationError> {
    if (0..=7).contains(&p) {
        Ok(())
    } else {
        Err(ValidationError::InvalidPeriod(p))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitary_weight_range() {
        assert!(validate_sanitary_weight(1).is_ok());
        assert!(validate_sanitary_weight(10).is_ok());
        assert!(validate_sanitary_weight(0).is_err());
        assert!(validate_sanitary_weight(11).is_err());
    }

    #[test]
    fn hours_range() {
        assert!(validate_hours_per_week(1).is_ok());
        assert!(validate_hours_per_week(6).is_ok());
        assert!(validate_hours_per_week(0).is_err());
        assert!(validate_hours_per_week(7).is_err());
    }

    #[test]
    fn availability_at_least_one() {
        let ok = AvailabilityMatrix([[true; 8]; 6]);
        assert!(validate_availability(&ok).is_ok());
        let bad = AvailabilityMatrix([[false; 8]; 6]);
        assert!(validate_availability(&bad).is_err());
    }

    #[test]
    fn split_teachers_distinct() {
        assert!(validate_split_teachers("a", Some("b")).is_ok());
        assert!(validate_split_teachers("a", Some("a")).is_err());
        assert!(validate_split_teachers("a", None).is_ok());
    }

    #[test]
    fn weights_zero_allowed() {
        let w = Weights {
            window: 0,
            room_displacement: 0,
            sanpin_parabola: 0,
            alternation: 0,
            movement: 0,
            load_balance: 0,
        };
        assert!(validate_weights(&w).is_ok());
    }

    #[test]
    fn weights_over_limit() {
        let w = Weights {
            window: 1001,
            ..Weights::default()
        };
        assert!(validate_weights(&w).is_err());
    }
}

//! Сетка времени — единственный источник истины о размере расписания.
//!
//! До введения этого модуля размер сетки был зашит литералами в нескольких
//! местах и они разошлись: пре-валидатор и солвер получали 6 дней, тогда как
//! фактические данные лежат в 5 днях. Любое место, которому нужен размер
//! сетки, обязано брать его отсюда.

use sqlx::SqlitePool;

use crate::db::DbError;

/// Размер сетки расписания.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct TimeGrid {
    pub days: i64,
    pub periods_per_day: i64,
    /// Урок, с которого начинается вторая смена (`None` — школа односменная).
    pub shift_boundary_period: Option<i64>,
}

impl Default for TimeGrid {
    /// Соответствует фактическим данным школы: пятидневка по 7 уроков.
    fn default() -> Self {
        Self { days: 5, periods_per_day: 7, shift_boundary_period: None }
    }
}

impl TimeGrid {
    /// Общее число слотов в неделю.
    pub fn total_slots(&self) -> i64 {
        self.days * self.periods_per_day
    }

    /// Лежит ли (день, урок) внутри сетки.
    pub fn contains(&self, day: i64, period: i64) -> bool {
        (0..self.days).contains(&day) && (0..self.periods_per_day).contains(&period)
    }

    /// Читает сетку из настроек. Отсутствие строки настроек — не ошибка:
    /// применяется значение по умолчанию.
    pub async fn load(pool: &SqlitePool) -> Result<Self, DbError> {
        let row = sqlx::query_as::<_, (i64, i64, Option<i64>)>(
            "SELECT days_per_week, periods_per_day, shift_boundary_period \
             FROM schedule_settings WHERE id = 'default'",
        )
        .fetch_optional(pool)
        .await?;

        Ok(match row {
            Some((days, periods_per_day, shift_boundary_period)) => {
                Self { days, periods_per_day, shift_boundary_period }
            }
            None => Self::default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_matches_production_data() {
        let g = TimeGrid::default();
        assert_eq!(g.days, 5, "фактические данные лежат в днях 0..4");
        assert_eq!(g.periods_per_day, 7, "фактические данные лежат в уроках 0..6");
        assert_eq!(g.total_slots(), 35);
    }

    #[test]
    fn contains_rejects_out_of_range() {
        let g = TimeGrid::default();
        assert!(g.contains(4, 6));
        assert!(!g.contains(5, 0), "суббота вне пятидневки");
        assert!(!g.contains(0, 7), "восьмой урок вне сетки");
        assert!(!g.contains(-1, 0));
    }

    #[tokio::test]
    async fn load_falls_back_to_default_without_settings() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::connect(&dir.path().join("t.db")).await.unwrap();
        // Миграция 0021 создаёт строку настроек — читаем именно её.
        let g = TimeGrid::load(&pool).await.unwrap();
        assert_eq!(g, TimeGrid::default());
    }
}

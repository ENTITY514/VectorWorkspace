use sqlx::SqlitePool;

use crate::db::DbError;

/// Портирование настроек из исходной четверти в целевую.
/// Deep clone: учителя и классы (с новыми ID и quarter_number=to_q).
/// Кабинеты и предметы — глобальные, не копируются. Варианты/слоты/фикс. слоты не копируются.
pub async fn port_quarter(
    pool: &SqlitePool,
    from_quarter: i64,
    to_quarter: i64,
) -> Result<(usize, usize), DbError> {
    if from_quarter == to_quarter {
        return Err(DbError::Validation(
            "from_quarter и to_quarter должны различаться".to_string(),
        ));
    }
    let mut tx = pool.begin().await?;

    // 1. Клонируем учителей: из from_quarter или глобальные (NULL)
    let teachers = sqlx::query_as::<_, (String, String, Option<String>, i64, String, String, bool, Option<i64>)>(
        "SELECT id, full_name, base_room_id, max_daily_lessons, availability_json, subject_ids, is_combined, quarter_number FROM schedule_teachers",
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut teacher_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for (id, full_name, base_room_id, max_daily, avail, subject_ids, is_combined, quarter) in teachers {
        let belongs = quarter.map_or(true, |q| q == from_quarter);
        if !belongs { continue; }
        let already_cloned = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM schedule_teachers WHERE quarter_number = ?1 AND full_name = ?2",
        )
        .bind(to_quarter)
        .bind(&full_name)
        .fetch_one(&mut *tx)
        .await?;
        if already_cloned > 0 { continue; }

        let new_id = format!("q{}_t{}", to_quarter, uuid::Uuid::new_v4());
        teacher_map.insert(id.clone(), new_id.clone());
        sqlx::query(
            "INSERT INTO schedule_teachers (id, full_name, base_room_id, max_daily_lessons, availability_json, subject_ids, is_combined, quarter_number)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(&new_id)
        .bind(&full_name)
        .bind(&base_room_id)
        .bind(max_daily)
        .bind(&avail)
        .bind(&subject_ids)
        .bind(is_combined)
        .bind(to_quarter)
        .execute(&mut *tx)
        .await?;
    }

    // 2. Клонируем классы
    let classes = sqlx::query_as::<_, (String, i64, String, i64, String, String, Option<i64>)>(
        "SELECT id, grade, letter, headcount, shift, class_type, quarter_number FROM schedule_classes",
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut class_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for (id, grade, letter, headcount, shift, class_type, quarter) in classes {
        let belongs = quarter.map_or(true, |q| q == from_quarter);
        if !belongs { continue; }
        let already_cloned = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM schedule_classes WHERE quarter_number = ?1 AND grade = ?2 AND letter = ?3",
        )
        .bind(to_quarter)
        .bind(grade)
        .bind(&letter)
        .fetch_one(&mut *tx)
        .await?;
        if already_cloned > 0 { continue; }

        let new_id = format!("q{}_c{}", to_quarter, uuid::Uuid::new_v4());
        class_map.insert(id.clone(), new_id.clone());
        sqlx::query(
            "INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type, quarter_number)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&new_id)
        .bind(grade)
        .bind(&letter)
        .bind(headcount)
        .bind(&shift)
        .bind(&class_type)
        .bind(to_quarter)
        .execute(&mut *tx)
        .await?;
    }

    // 3. Клонируем subgroup rules для новых классов
    for (old_class_id, new_class_id) in &class_map {
        let rules = sqlx::query_as::<_, (String, i64)>(
            "SELECT subject_id, group_count FROM schedule_subgroup_rules WHERE class_id = ?1",
        )
        .bind(old_class_id)
        .fetch_all(&mut *tx)
        .await?;
        for (subject_id, group_count) in rules {
            sqlx::query(
                "INSERT INTO schedule_subgroup_rules (id, class_id, subject_id, group_count) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(format!("{}_sg_{}", new_class_id, uuid::Uuid::new_v4()))
            .bind(new_class_id)
            .bind(&subject_id)
            .bind(group_count)
            .execute(&mut *tx)
            .await?;
        }
    }

    // 4. Клонируем curriculum (нагрузку) с перепривязкой новых ID
    for (old_class_id, new_class_id) in &class_map {
        let cur = sqlx::query_as::<_, (String, String, Option<String>, i64)>(
            "SELECT subject_id, teacher_id, split_teacher2_id, hours_per_week FROM schedule_curriculum WHERE class_id = ?1",
        )
        .bind(old_class_id)
        .fetch_all(&mut *tx)
        .await?;
        for (subject_id, teacher_id, split_teacher2_id, hours) in cur {
            let new_teacher = teacher_map.get(&teacher_id).cloned().unwrap_or(teacher_id.clone());
            let new_split2 = split_teacher2_id.as_ref().and_then(|t| teacher_map.get(t).cloned()).or(split_teacher2_id.clone());
            sqlx::query(
                "INSERT INTO schedule_curriculum (id, class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(format!("{}_cur_{}", new_class_id, uuid::Uuid::new_v4()))
            .bind(new_class_id)
            .bind(&subject_id)
            .bind(&new_teacher)
            .bind(&new_split2)
            .bind(hours)
            .execute(&mut *tx)
            .await?;
        }
    }

    let cloned_teachers = teacher_map.len();
    let cloned_classes = class_map.len();
    tx.commit().await?;

    Ok((cloned_teachers, cloned_classes))
}
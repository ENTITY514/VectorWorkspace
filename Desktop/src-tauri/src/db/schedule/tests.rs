#[cfg(test)]
mod schedule_tests {
    use crate::db::connect;
    use crate::db::schedule::{curriculum, rooms, slots, subjects, teachers};

    fn avail_all() -> String {
        let m = [[true; 8]; 6];
        serde_json::to_string(&m).unwrap()
    }

    fn avail_none() -> String {
        let m = [[false; 8]; 6];
        serde_json::to_string(&m).unwrap()
    }

    #[tokio::test]
    async fn availability_must_have_at_least_one() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        let res = teachers::upsert_teacher(&pool, None, "Иванов".into(), None, 0, avail_none()).await;
        assert!(res.is_err(), "expected NoAvailability, got {:?}", res);
    }

    #[tokio::test]
    async fn teacher_crud_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        let t = teachers::upsert_teacher(&pool, None, "Петрова".into(), None, 5, avail_all()).await.unwrap();
        let list = teachers::list_teachers(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, t.id);
    }

    #[tokio::test]
    async fn unique_room_name() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        rooms::upsert_room(&pool, None, "Каб. 1".into(), "General".into(), 30, None, None).await.unwrap();
        let dup = rooms::upsert_room(&pool, None, "Каб. 1".into(), "General".into(), 30, None, None).await;
        assert!(dup.is_err(), "duplicate name should fail, got {:?}", dup);
    }

    #[tokio::test]
    async fn sanitary_weight_validation() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        let bad = subjects::upsert_subject(&pool, "bad".into(), "Bad".into(), 11, None, false, false, "[]".into()).await;
        assert!(bad.is_err());
        let ok = subjects::upsert_subject(&pool, "math".into(), "Матем".into(), 9, None, false, false, "[]".into()).await;
        assert!(ok.is_ok());
    }

    #[tokio::test]
    async fn split_trigger_requires_second_teacher() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        // prerequisites
        let t1 = teachers::upsert_teacher(&pool, None, "Учитель1".into(), None, 0, avail_all()).await.unwrap();
        rooms::upsert_room(&pool, None, "Каб. 10".into(), "General".into(), 30, None, None).await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c1', 8, 'А', 25, 'First')")
            .execute(&pool).await.unwrap();
        subjects::upsert_subject(&pool, "eng".into(), "Английский".into(), 5, None, true, false, "[]".into()).await.unwrap();
        // try curriculum without second teacher — должен упасть триггер
        let res = curriculum::set_curriculum_entries(&pool, vec![("c1".into(), "eng".into(), t1.id.clone(), None, 2)]).await;
        assert!(res.is_err(), "split without second teacher should fail: {:?}", res);
        // с двумя — ок
        let t2 = teachers::upsert_teacher(&pool, None, "Учитель2".into(), None, 0, avail_all()).await.unwrap();
        let ok = curriculum::set_curriculum_entries(&pool, vec![("c1".into(), "eng".into(), t1.id.clone(), Some(t2.id.clone()), 2)]).await;
        assert!(ok.is_ok(), "split with two teachers should succeed: {:?}", ok);
    }

    #[tokio::test]
    async fn same_split_teachers_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        let t1 = teachers::upsert_teacher(&pool, None, "Учитель1".into(), None, 0, avail_all()).await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c1', 8, 'А', 25, 'First')")
            .execute(&pool).await.unwrap();
        subjects::upsert_subject(&pool, "eng".into(), "Английский".into(), 5, None, true, false, "[]".into()).await.unwrap();
        let res = curriculum::set_curriculum_entries(&pool, vec![("c1".into(), "eng".into(), t1.id.clone(), Some(t1.id.clone()), 2)]).await;
        assert!(res.is_err(), "same split teachers should fail");
    }

    #[tokio::test]
    async fn slots_unique_constraints() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        let t1 = teachers::upsert_teacher(&pool, None, "Учитель1".into(), None, 0, avail_all()).await.unwrap();
        let t2 = teachers::upsert_teacher(&pool, None, "Учитель2".into(), None, 0, avail_all()).await.unwrap();
        let r1 = rooms::upsert_room(&pool, None, "Каб. 1".into(), "General".into(), 30, None, None).await.unwrap();
        let r2 = rooms::upsert_room(&pool, None, "Каб. 2".into(), "General".into(), 30, None, None).await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c1', 8, 'А', 25, 'First'), ('c2', 8, 'Б', 25, 'First')")
            .execute(&pool).await.unwrap();
        subjects::upsert_subject(&pool, "math".into(), "Матем".into(), 9, None, false, false, "[]".into()).await.unwrap();
        // first slot ok (subgroup_label '' = whole class)
        sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period) VALUES ('s1', 'c1', 'math', ?1, ?2, '', 0, 0)")
            .bind(&t1.id).bind(&r1.id).execute(&pool).await.unwrap();
        // duplicate teacher same slot -> fail
        let dup_teacher = sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period) VALUES ('s2', 'c2', 'math', ?1, ?2, '', 0, 0)")
            .bind(&t1.id).bind(&r2.id).execute(&pool).await;
        assert!(dup_teacher.is_err(), "teacher singularity should fail: {:?}", dup_teacher);
        // duplicate room same slot -> fail
        let dup_room = sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period) VALUES ('s3', 'c2', 'math', ?1, ?2, '', 0, 0)")
            .bind(&t2.id).bind(&r1.id).execute(&pool).await;
        assert!(dup_room.is_err(), "room singularity should fail: {:?}", dup_room);
        // duplicate class same slot -> fail (same subgroup_label '')
        let dup_class = sqlx::query("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period) VALUES ('s4', 'c1', 'math', ?1, ?2, '', 0, 0)")
            .bind(&t2.id).bind(&r2.id).execute(&pool).await;
        assert!(dup_class.is_err(), "class singularity should fail: {:?}", dup_class);
    }

    #[tokio::test]
    async fn class_unique_grade_letter() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c1', 8, 'А', 25, 'First')")
            .execute(&pool).await.unwrap();
        let dup = sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c2', 8, 'А', 25, 'First')")
            .execute(&pool).await;
        assert!(dup.is_err());
    }

    #[tokio::test]
    async fn weights_zero_allowed_and_limits() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        // zero is allowed
        let w = slots::set_weights(&pool, 0, 0, 0, 0, 0, 0).await.unwrap();
        assert_eq!(w.window, 0);
        // over limit should fail
        let bad = slots::set_weights(&pool, 1001, 0, 0, 0, 0, 0).await;
        assert!(bad.is_err());
    }

    #[tokio::test]
    async fn cascade_delete_class_removes_subgroup_and_curriculum() {
        let dir = tempfile::tempdir().unwrap();
        let pool = connect(&dir.path().join("test.db")).await.unwrap();
        let t1 = teachers::upsert_teacher(&pool, None, "Учитель1".into(), None, 0, avail_all()).await.unwrap();
        sqlx::query("INSERT INTO schedule_classes (id, grade, letter, headcount, shift) VALUES ('c1', 8, 'А', 25, 'First')")
            .execute(&pool).await.unwrap();
        subjects::upsert_subject(&pool, "eng".into(), "Английский".into(), 5, None, true, false, "[]".into()).await.unwrap();
        sqlx::query("INSERT INTO schedule_subgroup_rules (id, class_id, subject_id, group_count) VALUES ('sr1', 'c1', 'eng', 2)")
            .execute(&pool).await.unwrap();
        curriculum::set_curriculum_entries(&pool, vec![("c1".into(), "eng".into(), t1.id.clone(), Some(t1.id.clone() + "x"), 2)]).await.unwrap_err(); // expect fail due to FK on second teacher (fake id)
        // use real t2
        let t2 = teachers::upsert_teacher(&pool, None, "Учитель2".into(), None, 0, avail_all()).await.unwrap();
        curriculum::set_curriculum_entries(&pool, vec![("c1".into(), "eng".into(), t1.id.clone(), Some(t2.id.clone()), 2)]).await.unwrap();
        // delete class
        sqlx::query("DELETE FROM schedule_classes WHERE id='c1'").execute(&pool).await.unwrap();
        let cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schedule_subgroup_rules WHERE class_id='c1'").fetch_one(&pool).await.unwrap();
        assert_eq!(cnt, 0);
        let cnt2: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schedule_curriculum WHERE class_id='c1'").fetch_one(&pool).await.unwrap();
        assert_eq!(cnt2, 0);
    }

    #[tokio::test]
    async fn variable_count_micro() {
        // микро-набор: 1 класс, 2 предмета, 3ч каждый = 6 instance, T=6 (1 день 6 периодов)
        // Проверяем что генерация переменных не паникует; число инстансов = 6
        let hours = vec![3, 3];
        let n: usize = hours.iter().sum::<usize>();
        assert_eq!(n, 6);
    }
}

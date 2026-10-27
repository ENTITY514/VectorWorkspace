## 1. Данные

- [ ] 1.1 Миграция `0025_school_profile.sql`: `schedule_teacher_profile`, `schedule_inclusion_students`,
      `schedule_inclusion_attendance`, `schedule_subject_pairs`, `schedule_room_swaps`, `schedule_teacher_wishes`;
      колонки `schedule_rooms.hall_size`, `schedule_classes.class_teacher_id`, `hall_size_override(_days_json)`,
      `schedule_settings.small_hall_max_headcount`, `class_teachers_arrive_first`.
- [ ] 1.2 Rust-домен `domain/schedule/profile.rs` + валидация (противоречия режима и доступности, часы посещения ≤ часов класса).
- [ ] 1.3 Репозитории `db/schedule/profile/*` + тесты DDL.
- [ ] 1.4 Команды Tauri: `schedule_profile_get/upsert_*`, `schedule_profile_checklist`, `schedule_profile_import` (JSON из `tools/bilimclass`).

## 2. Солвер и проверка

- [ ] 2.1 `solver/schema.py` — `schema_version=2`, блок `profile`, совместимость с v1.
- [ ] 2.2 `solver/constraints/profile.py` — перенос из `tools/bilimclass/schedule/model.py`: рабочие дни (`teacher_days_exact`),
      уроков в день (`teacher_min_per_day`), окна с 1-го урока (`start_first_teachers`), сдвоенные окна, предел окон,
      день ради одного урока, малая нагрузка, ученики на инклюзии (выбор посещения, 1-й урок, последний урок, окна),
      залы по размеру (с исключениями по дням), чередование и цепочки, обмены кабинетами с лимитом, пожелания-исключения.
- [ ] 2.3 Независимая проверка `solver/verify.py` для всех правил профиля (не общий код с моделью).
- [ ] 2.4 Постобработка кабинетов: маленький класс → свободный большой зал.
- [ ] 2.5 Регрессионный тест на наборе 2026–2027 (V53): профиль из JSON → верификация V53 без нарушений.

## 3. UI

- [ ] 3.1 `SchoolProfileWizard.tsx` — разделы, готовность, предупреждения с переходом к карточке.
- [ ] 3.2 `TeacherDrawer` — секция «Режим работы» с превью недели.
- [ ] 3.3 `InclusionStudentsTab.tsx` — ученики, посещение по предметам, правила дня, превью недели класса.
- [ ] 3.4 `SubjectPairsEditor.tsx`, `RoomSwapsEditor.tsx`, список пожеланий с причиной и автором.
- [ ] 3.5 Классы: численность, классный руководитель, категория зала и исключения.

## 4. Приёмка

- [ ] 4.1 Эталонные сценарии 1–3 из `docs/schedule/06-lessons-v33-v53.md` проходят на данных 2026–2027.

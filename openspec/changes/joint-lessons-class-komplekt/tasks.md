# Tasks: Joint Lessons (Совмещенные уроки)

- [x] 1. Создать SQL миграцию `Desktop/src-tauri/migrations/0018_joint_lessons.sql` <!-- id: 0 -->
- [x] 2. Обновить Pydantic схемы в `solver/schema.py` (`joint_lesson_id` в `CurriculumEntry` и `SlotOutput`) <!-- id: 1 -->
- [x] 3. Реализовать принудительную синхронизацию слотов и 1-интервальную проверку учителя в `solver/engine.py` <!-- id: 2 -->
- [x] 4. Написать автоматический тест CP-SAT для совмещенных уроков в `solver/tests/test_joint_lessons.py` <!-- id: 3 -->
- [x] 5. Обновить Tauri backend команду сохранения нагрузки в `Desktop/src-tauri/src/commands/schedule.rs` <!-- id: 4 -->
- [x] 6. Обновить интерфейсы TypeScript в `Desktop/src/domains/schedule/api.ts` <!-- id: 5 -->
- [x] 7. Добавить кнопку/функцию связывания совмещенных уроков в UI матрицы нагрузки `TeacherDrawer.tsx` <!-- id: 6 -->
- [x] 8. Добавить отображение бейджа совмещения `🔗 6 / 6 ЛУО` в `InteractiveGrid.tsx` <!-- id: 7 -->
- [x] 9. Провести сквозное тестирование генерации расписания с класс-комплектами <!-- id: 8 -->

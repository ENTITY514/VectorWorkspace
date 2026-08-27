# Руководство для Нейросети / AI Агентов (VectorWorkspace Developer Guide)

Данный гайд содержит ключевые инструкции, правила и технологический стек проекта **VectorWorkspace** для работы любых нейросетей (AI Assistant, Antigravity, Claude, ChatGPT).

---

## 1. Стек и Архитектура

### Технологии
- **Frontend:** Tauri v2, React 18, TypeScript, Vanilla CSS + Tailwind v4 (`@tailwindcss/vite`).
- **Desktop Host:** Rust (Tauri v2 IPC + SQLite via `sqlx`).
- **Solver Engine:** Python 3.13 (`ortools` CP-SAT solver).

### Прагматичная Архитектура (No FSD, No Redux)
1. **Никакого Over-engineering:** Используем только `useState`, `useMemo` и React Context. Никакого Redux / FSD / MobX.
2. **Разделение логики и UI:** Если `.tsx` файл превышает 200 строк:
   - Логика выносится в хук `useFeatureName.ts`.
   - UI-компоненты выносятся в `domains/featureName/ui/Component.tsx`.
3. **Tauri-First:** Всегда используем нативные плагины Tauri (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`).

---

## 2. Локация Ключевых Файлов

### Математический Солвер (Python)
- `solver/constraints/hard.py` — **Жесткие правила** (запрет накладок, joint-уроки, СанПиН вечер, 0 окон ЛУО, старт с Алгебры Пн/Вт).
- `solver/constraints/soft.py` — **Мягкие правила и штрафы** (окна учителей, парабола СанПиН, смены кабинетов, чередование).
- `solver/engine.py` — Главный оркестратор CP-SAT солвера.

### Вспомогательные Скрипты (Data Pipelines & Verification)
- `scripts/update_q4_joint_lessons.py` — Генератор расписания Q4, автодетект класс-комплектов и запуск CP-SAT (Вариант 3).
- `scripts/reseed_sqlite_db.py` — Полный перепосев SQLite базы `vector.db` (классы, кабинеты, предметы, учителя, слоты).
- `scripts/verify_v3_math_fix.py` — Проверка синхронизации 7б / 7б ЛУО и чередования Алгебра/Геометрия.
- `scripts/verify_luo_and_math_strict_rules.py` — Проверка отсутствия 7-х уроков и окон у спецклассов ЛУО/ДО.

### Rust Backend & Pre-Validator
- `Desktop/src-tauri/src/domain/schedule/pre_validate.rs` — Пре-валидатор готовности данных до запуска Python.
- `Desktop/src-tauri/src/domain/schedule/model.rs` — Матрица доступности учителя `AvailabilityMatrix` (6x8).
- `Desktop/src-tauri/src/infra/solver_host.rs` — Хост запуска Python солвера (`pythoncore-3.13-64`).

### React UI (Desktop)
- `Desktop/src/domains/schedule/SchedulePage.tsx` — Главный экран расписания.
- `Desktop/src/domains/schedule/ui/GenerateModal.tsx` — Модальное окно выбора времени и кнопки отмены генерации.
- `Desktop/src/domains/schedule/ui/ScheduleQualityWidget.tsx` — Виджет анализа качества и графика СанПиН (Recharts).
- `Desktop/src/domains/schedule/ui/InteractiveGrid.tsx` — Интерактивная сетка расписания (мультифильтр учителей, закрепление слотов).

---

## 3. Важные Технические Нюансы (Gotchas & Known Rules)

1. **Python Path на Windows:**
   Интерпретатор Python с установленным `ortools` 9.15 располагается по пути:
   `C:\Users\imanb\AppData\Local\Python\pythoncore-3.13-64\python.exe`
2. **Физическая vs Академическая нагрузка учителя:**
   Учителя с класс-комплектами (например, Актаева А.Е., Дмитриев Е.В.) имеют высокий сырой балл часов (40 ч), но их **физическая нагрузка составляет 35 слотов/нед** из-за совмещенных уроков (`joint_lesson_id`). При расчете лимита слотов всегда учитывайте `joint_lesson_id`!
3. **Формат availability_json:**
   Формат матрицы доступности учителя — строка JSON 6×8 2D массива булевых значений `[[true,true,...]*8]*6`. Пустые строки `[]` автоматически приводятся к `all_available()`.
4. **Проверка Foreign Keys в SQLite:**
   Перед изменением схемы или выполнением миграций обязательно запускайте:
   `C:\Users\imanb\AppData\Local\Python\pythoncore-3.13-64\python.exe scripts/reseed_sqlite_db.py`
   чтобы убедиться, что `PRAGMA foreign_key_check` выдает 0 ошибок!

---

## 4. Алгоритм Решения Задач для Нейросети

1. **Если нужно изменить математическое правило расписания:**
   - Для жесткого запрета $\rightarrow$ добавьте ограничение в `solver/constraints/hard.py`.
   - Для мягкого штрафа $\rightarrow$ скорректируйте `solver/constraints/soft.py`.
   - Проведите перерасчет: `python scripts/update_q4_joint_lessons.py`.
   - Обновите SQLite БД: `python scripts/reseed_sqlite_db.py`.
   - Проверьте корректность скриптом проверки.
2. **Если нужно изменить UI компоненты:**
   - Изменяйте `.tsx` файлы в `Desktop/src/domains/schedule/ui/`.
   - Проверьте типы: `npx tsc --noEmit` в папке `Desktop`.
   - Проверьте сборку: `npm run build` в папке `Desktop`.

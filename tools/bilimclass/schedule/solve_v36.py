"""Оптимизатор CP-SAT для генерации V36.

Ключевые требования V36:
1. Английский язык 10А (Алекпарова А.Ж.) строго зафиксирован во всех окнах Бабича И.Д.:
   - Вторник 4 ур. (каб. 17)
   - Среда 3 ур. (каб. 17)
   - Четверг 3 ур. (каб. 17)
2. Все 21 урок Бабича И.Д. и взаимные свапы кабинетов 17/19 с Ольгой Викторовной Красноперовой нетронуты.
3. Полная ликвидация окон Анастасии (7А ЛУО) в понедельник:
   - 1–4 уроки строго посещаемые (08:15–11:40 монолит без окон)
   - 5–6 уроки строго непосещаемые (Анастасия уходит домой)
4. Красноперова О.В.: строго <= 7 окон на всю неделю (0 новых окон), в понедельник монолит (0 окон).
5. Русина Н.В. строго 1 окно на неделю (0 в Пн/Вт), Пащенко Н.А. строго 0 окон, начальные классы (1-4) заморожены.
6. Пятничный труд 7А (каб. 29/39, 1 ур) и физика 7А (каб. 16, 6 ур) заморожены.
"""
import copy
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

from ortools.sat.python import cp_model

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.append(str(Path(__file__).resolve().parent))
from dataset import DAYS, PERIODS, DAY_LABELS, build, MATH, ALGEBRA, GEOMETRY, DOMAINS
from verify import verify

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "bilimclass" / "output"

def run_solver(time_limit_sec=180):
    print(f"=== Запуск CP-SAT оптимизатора V36 (лимит: {time_limit_sec} сек) ===")
    school = build()
    v34_path = OUT / "V34.json"
    with open(v34_path, encoding="utf-8") as f:
        v34 = json.load(f)

    slots = v34["slots"]
    rooms = v34["rooms"]
    prof = v34.get("profile", {})

    # 1. Определение замороженных уроков
    pinned = set()
    # Начальные классы (1-4)
    for mi, mt in enumerate(school.meetings):
        if any(int(c[:-1]) <= 4 for c in mt.classes):
            pinned.add(mi)
        # Пащенко Н.А. строго без изменений
        if any("Пащенко" in s.teacher for s in mt.sections):
            pinned.add(mi)
        # Подгруппы других классов не расцепляем
        if len(mt.sections) > 1 and "7А" not in mt.classes:
            pinned.add(mi)

    # Русина Н.В. строго заморожена (0 новых окон)
    rusina = "Русина Наталья Владимировна"
    for mi, mt in enumerate(school.meetings):
        if any(s.teacher == rusina for s in mt.sections):
            pinned.add(mi)

    # Пятничный труд 7А (mi=250) и пятничная физика 7А (mi=269)
    pinned.add(250)
    pinned.add(269)

    # Английский язык 10А во вторник 4 ур. (каб. 17 в окне Бабича) строго заморожен
    pinned.add(425)

    m7 = set(mi for mi, mt in enumerate(school.meetings) if "7А" in mt.classes)
    teachers_7a = {s.teacher for mi in m7 for s in school.meetings[mi].sections}

    # Подвижные встречи: 7А + уроки учителей 7А в 5-11 классах
    movable = set(m7) - pinned
    for mi, mt in enumerate(school.meetings):
        if mi in pinned:
            continue
        if any(s.teacher in teachers_7a for s in mt.sections):
            movable.add(mi)

    fixed = set(range(len(school.meetings))) - movable
    print(f"Всего уроков: {len(school.meetings)}, Подвижных: {len(movable)}, Зафиксированных: {len(fixed)}")

    model = cp_model.CpModel()

    # 2. Переменные x[mi, d, p]
    x = {}
    for mi in movable:
        mt = school.meetings[mi]
        for d in range(DAYS):
            for p in range(7):
                if any(not school.availability[s.teacher][d][p] for s in mt.sections):
                    continue
                x[(mi, d, p)] = model.NewBoolVar(f"x_{mi}_{d}_{p}")

    # Занятость фиксированных уроков
    t_fixed = set()
    c_fixed = set()
    for mi in fixed:
        d, p = slots[str(mi)]
        mt = school.meetings[mi]
        for c in mt.classes:
            c_fixed.add((c, d, p))
        for s in mt.sections:
            t_fixed.add((s.teacher, d, p))

    # Каждый подвижный урок размещается ровно 1 раз
    for mi in movable:
        vars_mi = [x[(mi, d, p)] for d in range(DAYS) for p in range(7) if (mi, d, p) in x]
        model.AddExactlyOne(vars_mi)

    # Конфликты классов и учителей
    for d in range(DAYS):
        for p in range(7):
            class_meetings = {}
            for mi in movable:
                mt = school.meetings[mi]
                for c in mt.classes:
                    class_meetings.setdefault(c, []).append(mi)
            for c, mis in class_meetings.items():
                if (c, d, p) in c_fixed:
                    for mi in mis:
                        if (mi, d, p) in x:
                            model.Add(x[(mi, d, p)] == 0)
                else:
                    c_vars = [x[(mi, d, p)] for mi in mis if (mi, d, p) in x]
                    model.Add(sum(c_vars) <= 1)

            teacher_meetings = {}
            for mi in movable:
                mt = school.meetings[mi]
                for s in mt.sections:
                    teacher_meetings.setdefault(s.teacher, []).append(mi)
            for t, mis in teacher_meetings.items():
                if (t, d, p) in t_fixed:
                    for mi in mis:
                        if (mi, d, p) in x:
                            model.Add(x[(mi, d, p)] == 0)
                else:
                    t_vars = [x[(mi, d, p)] for mi in mis if (mi, d, p) in x]
                    model.Add(sum(t_vars) <= 1)

    # Непрерывность уроков у классов (без внутренних окон)
    for c in set(c for mi in movable for c in school.meetings[mi].classes):
        mis = [mi for mi in movable if c in school.meetings[mi].classes]
        for d in range(DAYS):
            for p in range(6):
                has_p = sum(x[(mi, d, p)] for mi in mis if (mi, d, p) in x) + (1 if (c, d, p) in c_fixed else 0)
                has_p1 = sum(x[(mi, d, p + 1)] for mi in mis if (mi, d, p + 1) in x) + (1 if (c, d, p + 1) in c_fixed else 0)
                model.Add(has_p1 <= has_p)

    # Сохранение числа уроков в день у всех классов
    for c in set(c for mi in movable for c in school.meetings[mi].classes):
        mis = [mi for mi in movable if c in school.meetings[mi].classes]
        for d in range(DAYS):
            fixed_count = sum(1 for mi in fixed if c in school.meetings[mi].classes and slots[str(mi)][0] == d)
            orig_count = sum(1 for mi in range(len(school.meetings)) if c in school.meetings[mi].classes and slots[str(mi)][0] == d)
            d_vars = [x[(mi, d, p)] for mi in mis for p in range(7) if (mi, d, p) in x]
            model.Add(sum(d_vars) + fixed_count == orig_count)

    # Не больше 1 урока одного предмета в день у класса
    for c in set(c for mi in movable for c in school.meetings[mi].classes):
        subj_mis = {}
        for mi in movable:
            if c in school.meetings[mi].classes:
                for sj in school.meetings[mi].class_subjects(c):
                    subj_mis.setdefault(sj, []).append(mi)
        for sj, mis in subj_mis.items():
            if len(mis) > 1 and sj not in ["Художественный труд", "Трудовое обучение"]:
                for d in range(DAYS):
                    fixed_count = sum(1 for mi in fixed if c in school.meetings[mi].classes and sj in school.meetings[mi].class_subjects(c) and slots[str(mi)][0] == d)
                    s_vars = [x[(mi, d, p)] for mi in mis for p in range(7) if (mi, d, p) in x]
                    model.Add(sum(s_vars) + fixed_count <= 1)

    # Ограничения по доменам (история, математика, русский - не больше 1 в день):
    for c in set(c for mi in movable for c in school.meetings[mi].classes):
        for dom in ["history", "math", "rus"]:
            dom_subjs = DOMAINS[dom]
            dom_mis = [mi for mi in movable if c in school.meetings[mi].classes and any(sj in dom_subjs for sj in school.meetings[mi].class_subjects(c))]
            if dom_mis:
                for d in range(DAYS):
                    fixed_dom = sum(1 for mi in fixed if c in school.meetings[mi].classes and any(sj in dom_subjs for sj in school.meetings[mi].class_subjects(c)) and slots[str(mi)][0] == d)
                    d_vars = [x[(mi, d, p)] for mi in dom_mis for p in range(7) if (mi, d, p) in x]
                    model.Add(sum(d_vars) + fixed_dom <= 1)

    # СанПиН: математика в Пн и Пт не позже 4-го урока (p <= 3)
    for mi in movable:
        mt = school.meetings[mi]
        if any(sj in ["Алгебра", "Геометрия", "Математика"] for s in mt.sections for sj in s.subjects):
            for d in [0, 4]:
                for p in range(4, 7):
                    if (mi, d, p) in x:
                        model.Add(x[(mi, d, p)] == 0)

    # СанПиН: геометрия не в понедельник для 7А, алгебра не во вторник для 7А
    for mi in m7:
        if mi in movable:
            subjs = list(school.meetings[mi].class_subjects("7А"))
            if any(sj in GEOMETRY for sj in subjs):
                for p in range(7):
                    if (mi, 0, p) in x:
                        model.Add(x[(mi, 0, p)] == 0)
            if any(sj in ALGEBRA for sj in subjs):
                for p in range(7):
                    if (mi, 1, p) in x:
                        model.Add(x[(mi, 1, p)] == 0)

    # Полный контроль кабинетов
    room_of_sec = {}
    for mi, mt in enumerate(school.meetings):
        for si, s in enumerate(mt.sections):
            r = rooms.get(f"{mi}|{si}")
            if r:
                room_of_sec[(mi, si)] = r

    r_fixed = set()
    for mi in fixed:
        d, p = slots[str(mi)]
        for si in range(len(school.meetings[mi].sections)):
            r = room_of_sec.get((mi, si))
            if r:
                r_fixed.add((r, d, p))

    for d in range(DAYS):
        for p in range(7):
            by_room = {}
            for mi in movable:
                for si in range(len(school.meetings[mi].sections)):
                    r = room_of_sec.get((mi, si))
                    if r:
                        by_room.setdefault(r, []).append(mi)
            for r, mis in by_room.items():
                if (r, d, p) in r_fixed:
                    for mi in mis:
                        if (mi, d, p) in x:
                            model.Add(x[(mi, d, p)] == 0)
                else:
                    r_vars = [x[(mi, d, p)] for mi in mis if (mi, d, p) in x]
                    if len(r_vars) > 1:
                        model.Add(sum(r_vars) <= 1)

    # 3. Моделирование уроков Анастасии (7А ЛУО)
    att_subj = {
        "Русский язык", "Алгебра", "Геометрия", "Биология", "География",
        "История Казахстана", "Физическая культура", "Русская литература",
        "Художественный труд", "Казахский язык и литература", "Физика", "Химия"
    }
    att_m = [mi for mi in m7 if list(school.meetings[mi].class_subjects("7А"))[0] in att_subj]
    non_m = [mi for mi in m7 if list(school.meetings[mi].class_subjects("7А"))[0] not in att_subj]

    # В понедельник: 1-4 уроки строго посещаемые (08:15 - 11:40 монолит без окон!)
    for p in [0, 1, 2, 3]:
        p_vars = [x[(mi, 0, p)] for mi in att_m if (mi, 0, p) in x]
        model.Add(sum(p_vars) == 1)

    # 5-6 уроки строго непосещаемые (Анастасия уже дома, окон нет!)
    for p in [4, 5]:
        p_vars = [x[(mi, 0, p)] for mi in non_m if (mi, 0, p) in x]
        model.Add(sum(p_vars) == 1)

    # 4. Моделирование окон преподавателей
    def get_teacher_windows(t):
        t_mis = [mi for mi in range(len(school.meetings)) if any(s.teacher == t for s in school.meetings[mi].sections)]
        wins = []
        for d in range(DAYS):
            occ = []
            for p in range(7):
                fixed_p = 1 if any(mi in fixed and slots[str(mi)] == [d, p] for mi in t_mis) else 0
                mov_vars = [x[(mi, d, p)] for mi in t_mis if mi in movable and (mi, d, p) in x]
                if not mov_vars:
                    occ.append(fixed_p)
                else:
                    b = model.NewBoolVar(f"occ_{t}_{d}_{p}")
                    model.Add(b == sum(mov_vars) + fixed_p)
                    occ.append(b)

            count_d = sum(occ)
            has_lesson = model.NewBoolVar(f"has_{t}_{d}")
            model.Add(count_d >= 1).OnlyEnforceIf(has_lesson)
            model.Add(count_d == 0).OnlyEnforceIf(has_lesson.Not())

            start_d = model.NewIntVar(0, 6, f"start_{t}_{d}")
            end_d = model.NewIntVar(0, 6, f"end_{t}_{d}")

            for p in range(7):
                if isinstance(occ[p], int):
                    if occ[p] == 1:
                        model.Add(start_d <= p)
                        model.Add(end_d >= p)
                else:
                    model.Add(start_d <= p).OnlyEnforceIf(occ[p])
                    model.Add(end_d >= p).OnlyEnforceIf(occ[p])

            win_d = model.NewIntVar(0, 6, f"win_{t}_{d}")
            model.Add(win_d >= end_d - start_d + 1 - count_d).OnlyEnforceIf(has_lesson)
            model.Add(win_d == 0).OnlyEnforceIf(has_lesson.Not())
            wins.append(win_d)
        return wins

    # Красноперова О.В.: строго <= 7 окон (0 новых окон), в понедельник строго 0 окон!
    krasno_wins = get_teacher_windows("Красноперова Ольга Викторовна")
    model.Add(sum(krasno_wins) <= 7)
    model.Add(krasno_wins[0] == 0)

    # Ольков Г.В.: целевая минимизация окон
    olk_wins = get_teacher_windows("Ольков Геннадий Васильевич")

    # Дмитриев Е.В.: целевая минимизация окон
    dmit_wins = get_teacher_windows("Дмитриев Евгений Владимирович")

    # Учителя 7А: строго без увеличения общего числа окон
    for t_protect in ["Досаева Мадина Хайрулловна", "Бедрина Мария Николаевна", "Власова Айгуль Каирбековна", "Алекпарова Алия Жумабаевна"]:
        tw = get_teacher_windows(t_protect)
        t_mis = [mi for mi in range(len(school.meetings)) if any(s.teacher == t_protect for s in school.meetings[mi].sections)]
        orig_w = 0
        for d in range(DAYS):
            ops = sorted([slots[str(mi)][1] for mi in t_mis if slots[str(mi)][0] == d])
            if ops:
                orig_w += (ops[-1] - ops[0] + 1) - len(ops)
        model.Add(sum(tw) <= orig_w)

    # 5. Переменные перемещений (Move budget и штрафы)
    diff_vars = []
    for mi in movable:
        d_orig, p_orig = slots[str(mi)]
        if (mi, d_orig, p_orig) in x:
            b = model.NewBoolVar(f"diff_{mi}")
            model.Add(b == 1 - x[(mi, d_orig, p_orig)])
            diff_vars.append((mi, b))

    # Лимит перемещений: <= 28
    model.Add(sum(b for mi, b in diff_vars) <= 28)

    # Целевая функция
    model.Minimize(
        sum(100 * b for mi, b in diff_vars) +
        3000 * sum(dmit_wins) +
        2000 * sum(olk_wins) +
        1000 * sum(krasno_wins)
    )

    # Добавляем хинты от V34
    for mi in movable:
        d_orig, p_orig = slots[str(mi)]
        for d in range(DAYS):
            for p in range(7):
                if (mi, d, p) in x:
                    model.AddHint(x[(mi, d, p)], 1 if (d, p) == (d_orig, p_orig) else 0)

    # 6. Запуск CP-SAT
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_sec)
    solver.parameters.num_workers = 8
    solver.parameters.log_search_progress = False

    print("Запуск солвера...")
    t0 = time.time()
    status = solver.Solve(model)
    elapsed = time.time() - t0

    print(f"\nСолвер завершил работу за {elapsed:.1f} сек. Статус: {solver.StatusName(status)}")
    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        print(f"Значение целевой функции: {solver.ObjectiveValue()}")
        v36 = copy.deepcopy(v34)
        v36["name"] = "V36"
        v36["title"] = "Версия 36 (Английский в окне Бабича, Анастасия без окон, защита Красноперовой и Русиной)"
        v36["profile"]["name"] = "V36"
        v36["profile"]["title"] = "Версия 36"
        v36["profile"]["description"] = "Версия 36: Английский 10А в окне Бабича (Вт 4 ур., каб. 17), ликвидация окон Анастасии в Пн (1-4 ур. монолит), Красноперова без новых окон (Пн монолит), Русина 1 окно, Пащенко 0 окон."

        moved = []
        for mi, b in diff_vars:
            if solver.Value(b) == 1:
                d_orig, p_orig = slots[str(mi)]
                for d in range(DAYS):
                    for p in range(7):
                        if (mi, d, p) in x and solver.Value(x[(mi, d, p)]) == 1:
                            v36["slots"][str(mi)] = [d, p]
                            cls = "/".join(school.meetings[mi].classes)
                            sj = list(school.meetings[mi].class_subjects(list(school.meetings[mi].classes)[0]))[0]
                            t = "/".join(s.teacher for s in school.meetings[mi].sections)
                            moved.append((mi, cls, sj, t, DAY_LABELS[d_orig], p_orig + 1, DAY_LABELS[d], p + 1))

        print(f"\nВсего перемещено уроков: {len(moved)}")
        for mi, cls, sj, t, d1, p1, d2, p2 in moved:
            print(f"  [{cls}] {sj} ({t}): {d1} {p1} ур -> {d2} {p2} ур (mi={mi})")

        # Устранение накладки в каб. 42 (Ср 4 ур.): 2А Казахский язык (Жекеева) переводим в свободный каб. 29
        v36["rooms"]["80|0"] = "room_29"

        # Сохраняем V36.json
        v36_file = OUT / "V36.json"
        with open(v36_file, "w", encoding="utf-8") as f:
            json.dump(v36, f, ensure_ascii=False, indent=2)
        print(f"\nСохранено в {v36_file}")

        # Экспорт в Excel
        import subprocess
        print("\nГенерация печатных бланков и завуч-файлов для V36...")
        subprocess.run([sys.executable, str(ROOT / "tools/bilimclass/schedule/export_print.py"), "V36"], check=True)
        subprocess.run([sys.executable, str(ROOT / "tools/bilimclass/schedule/export_review.py"), "V36"], check=True)
        print("Экспорт успешно завершён!")

        # Проверка верификатором
        start_hard = {c for c in school.classes
                      if (prof.get("primary_start_hard") and int(c[:-1]) <= 4)
                      or (prof.get("start_hard_except") is not None and c not in prof.get("start_hard_except"))}

        errs = verify(school, v36, v36["relaxed_daily"],
                      no_window_teachers=prof.get("no_window_teachers", ()),
                      start_hard_classes=start_hard,
                      balanced_hard=prof.get("balanced_hard", ()),
                      pins=prof.get("pins", ()),
                      babich_windows_at=prof.get("babich_windows_at", ()),
                      alia_all_in_babich_windows=prof.get("alia_all_in_babich_windows", False),
                      math_one_later_teachers=prof.get("math_one_later_teachers", ()),
                      math_one_later_days=prof.get("math_one_later_days"),
                      teacher_day_cap=prof.get("teacher_day_cap", False),
                      low_teachers=prof.get("window_low_teachers", ()),
                      natural_not_adjacent=prof.get("natural_not_adjacent", False),
                      cap_exempt=prof.get("teacher_cap_exempt", ()),
                      natural_exempt=prof.get("natural_exempt_classes", ()),
                      babich_no_swap_classes=prof.get("babich_no_swap_classes", ()))

        print(f"\nОшибок верификатора: {len(errs)}")
        for e in errs:
            print("  ", e)

        print("\n=== Аудит окон учителей (V34 -> V36) ===")
        teachers = sorted(set(s.teacher for mt in school.meetings for s in mt.sections))
        for t in teachers:
            t_mis = [mi for mi, mt in enumerate(school.meetings) if any(s.teacher == t for s in mt.sections)]
            old_win = 0
            new_win = 0
            for d in range(DAYS):
                ops = sorted([slots[str(mi)][1] for mi in t_mis if slots[str(mi)][0] == d])
                if ops:
                    old_win += (ops[-1] - ops[0] + 1) - len(ops)
                nps = sorted([v36["slots"][str(mi)][1] for mi in t_mis if v36["slots"][str(mi)][0] == d])
                if nps:
                    new_win += (nps[-1] - nps[0] + 1) - len(nps)
            if old_win != new_win or t in ["Красноперова Ольга Викторовна", "Русина Наталья Владимировна", "Пащенко Наталья Аркадьевна", "Ольков Геннадий Васильевич", "Бабич Иман Денисович"]:
                diff = new_win - old_win
                sign = f"+{diff}" if diff > 0 else f"{diff}"
                print(f"  {t:35s}: {old_win} -> {new_win} ({sign})")

        return v36, moved, errs
    else:
        print("Решение не найдено!")
        return None, [], []

if __name__ == "__main__":
    t_lim = int(sys.argv[1]) if len(sys.argv) > 1 else 180
    run_solver(t_lim)

"""Независимая проверка готового расписания по жёстким правилам + метрики качества."""
from __future__ import annotations

from collections import defaultdict

from dataset import (ALEKPAROVA, ALGEBRA, BABICH, BABICH_ROOM, CHEMISTRY, CROSS_SUBJECTS, DAYS, DAY_LABELS, DOMAINS,
                     GEOMETRY, KRASNOPEROVA, MATH, PERIODS, School, grade_of, language_of)


def placements(school: School, res: dict):
    """Список размещённых секций: (mi, si, d, p, room)."""
    out = []
    for mi, mt in enumerate(school.meetings):
        d, p = res["slots"][str(mi)]
        for si, sec in enumerate(mt.sections):
            out.append((mi, si, d, p, res["rooms"][f"{mi}|{si}"]))
    return out


def verify(school: School, res: dict, relaxed: list[str], no_window_teachers=(),
           start_hard_classes=frozenset(), balanced_hard=(), pins=(), babich_windows_at=(),
           alia_all_in_babich_windows=False, math_one_later_teachers=(), math_one_later_days=None,
           teacher_day_cap=False, low_teachers=(), natural_not_adjacent=False,
           cap_exempt=(), natural_exempt=(), cap_extra=1, babich_no_swap_classes=()) -> list[str]:
    errs = _verify_core(school, res, relaxed, no_window_teachers, start_hard_classes, balanced_hard,
                        math_one_later_teachers, math_one_later_days)
    s = school
    slot_of = {mi: tuple(res["slots"][str(mi)]) for mi in range(len(s.meetings))}
    for mi, mt in enumerate(s.meetings):
        if set(mt.classes) & set(babich_no_swap_classes):
            for si, sec in enumerate(mt.sections):
                if sec.teacher == BABICH and res["rooms"][f"{mi}|{si}"] != BABICH_ROOM:
                    d, p = slot_of[mi]
                    errs.append(f"{mt.id}: Бабич в {'/'.join(mt.classes)} не в своём кабинете "
                                f"({DAY_LABELS[d]} {p + 1})")
    if teacher_day_cap:
        per = defaultdict(lambda: defaultdict(int))
        for mi, mt in enumerate(s.meetings):
            for t in mt.teachers:
                per[t][slot_of[mi][0]] += 1
        for t, days in per.items():
            if t in low_teachers or t in cap_exempt:
                continue
            work = [d for d in range(DAYS) if any(s.availability[t][d][:PERIODS])]
            if len(work) < 2:
                continue
            cap = -(-sum(days.values()) // len(work)) + cap_extra
            for d, n in days.items():
                if n > cap:
                    errs.append(f"{t}: {n} уроков в {DAY_LABELS[d]} (предел {cap})")
    if natural_not_adjacent:
        nat = {"Физика", "Химия", "Биология"}
        at = defaultdict(dict)
        for mi, mt in enumerate(s.meetings):
            for c in mt.classes:
                for sj in mt.class_subjects(c) & nat:
                    at[(c, slot_of[mi][0])][slot_of[mi][1]] = sj
        for (c, d), ps in at.items():
            if c in natural_exempt:
                continue
            for p, sj in ps.items():
                if p + 1 in ps and ps[p + 1] != sj:
                    errs.append(f"{c} {DAY_LABELS[d]}: {sj} и {ps[p + 1]} подряд ({p + 1}–{p + 2} уроки)")
    babich_busy = defaultdict(set)
    for mi, mt in enumerate(s.meetings):
        if BABICH in mt.teachers:
            babich_busy[slot_of[mi][0]].add(slot_of[mi][1])

    def babich_window(d, p):
        ps = babich_busy[d]
        return ps and p not in ps and min(ps) < p < max(ps)

    day_pins: dict[tuple, int] = {}
    for pin in pins:
        if pin.get("period") is None:
            key = (pin["class"], pin["subject"], pin["day"])
            day_pins[key] = day_pins.get(key, 0) + 1
    for (c, sj, d), n in day_pins.items():
        got = sum(1 for mi, mt in enumerate(s.meetings)
                  if c in mt.classes and sj in mt.class_subjects(c) and slot_of[mi][0] == d)
        if got != n:
            errs.append(f"{c} {sj}: в {DAY_LABELS[d]} {got} урока вместо {n} (закрепление на день)")
    for pin in pins:
        if pin.get("period") is None:
            continue
        c, sj, d, p = pin["class"], pin["subject"], pin["day"], pin["period"] - 1
        ok = False
        for mi, mt in enumerate(s.meetings):
            if c in mt.classes and sj in mt.class_subjects(c) and slot_of[mi] == (d, p) and \
                    (not pin.get("teacher") or pin["teacher"] in mt.teachers):
                if pin.get("room"):
                    ok = any(sec.teacher == pin["teacher"] and res["rooms"][f"{mi}|{si}"] == pin["room"]
                             for si, sec in enumerate(mt.sections))
                else:
                    ok = True
        if not ok:
            errs.append(f"закрепление не выполнено: {pin}")
    for d, period in babich_windows_at:
        if not babich_window(d, period - 1):
            errs.append(f"у Бабича нет окна {DAY_LABELS[d]} {period} урок")
    if alia_all_in_babich_windows:
        for mi, mt in enumerate(s.meetings):
            for si, sec in enumerate(mt.sections):
                if sec.teacher == ALEKPAROVA and {a[0] for a in sec.attendees} & {"9Б", "10А"}:
                    d, p = slot_of[mi]
                    if not babich_window(d, p) or res["rooms"][f"{mi}|{si}"] != BABICH_ROOM:
                        errs.append(f"английский Алекпаровой {mt.id} не в окне Бабича/каб.17 "
                                    f"({DAY_LABELS[d]} {p + 1})")
    return errs


def _verify_core(school: School, res: dict, relaxed: list[str], no_window_teachers,
                 start_hard_classes, balanced_hard, math_one_later_teachers=(),
                 math_one_later_days=None) -> list[str]:
    errs: list[str] = []
    s = school
    if len(res["slots"]) != len(s.meetings):
        errs.append(f"размещено {len(res['slots'])} из {len(s.meetings)} событий")
        return errs
    pl = placements(s, res)
    slot_of = {mi: tuple(res["slots"][str(mi)]) for mi in range(len(s.meetings))}

    teacher_at = defaultdict(list)
    class_at = defaultdict(set)
    room_at = defaultdict(list)
    for mi, si, d, p, room in pl:
        sec = s.meetings[mi].sections[si]
        teacher_at[(sec.teacher, d, p)].append(mi)
        room_at[(room, d, p)].append((mi, si))
        for c in {a[0] for a in sec.attendees}:
            class_at[(c, d, p)].add(mi)
        if not s.availability[sec.teacher][d][p]:
            errs.append(f"{sec.teacher}: недоступен {DAY_LABELS[d]} {p + 1} урок")
        if room not in sec.rooms:
            errs.append(f"{s.meetings[mi].id}: недопустимый кабинет {room}")
    for k, v in teacher_at.items():
        if len(set(v)) > 1:
            errs.append(f"учитель {k[0]} в двух местах {DAY_LABELS[k[1]]} {k[2] + 1}")
    for k, v in class_at.items():
        if len(v) > 1:
            errs.append(f"класс {k[0]} на двух уроках {DAY_LABELS[k[1]]} {k[2] + 1}")
    for k, v in room_at.items():
        if len(v) > 1:
            errs.append(f"кабинет {k[0]} занят дважды {DAY_LABELS[k[1]]} {k[2] + 1}: {v}")

    for c in s.classes:
        for d in range(DAYS):
            ps = sorted(p for p in range(PERIODS) if class_at.get((c, d, p)))
            if not ps:
                continue
            if ps[-1] - ps[0] + 1 != len(ps):
                errs.append(f"{c} {DAY_LABELS[d]}: окно у учеников ({[p + 1 for p in ps]})")
            if len(ps) > s.class_max_lessons[c] or ps[-1] >= s.class_max_lessons[c]:
                errs.append(f"{c} {DAY_LABELS[d]}: превышен лимит уроков ({len(ps)}, последний {ps[-1] + 1})")
            if c in start_hard_classes and ps[0] != 0:
                errs.append(f"{c} {DAY_LABELS[d]}: начинает с {ps[0] + 1}-го урока")
    for c in balanced_hard:
        counts = [len({p for p in range(PERIODS) if class_at.get((c, d, p))}) for d in range(DAYS)]
        if max(counts) - min(counts) > 1:
            errs.append(f"{c}: неравномерно по дням {counts}")
    for t in no_window_teachers:
        for d in range(DAYS):
            ps = sorted({p for (tt, dd, p), v in teacher_at.items() if tt == t and dd == d})
            if ps:
                gaps = [p for p in range(ps[0], ps[-1]) if p not in ps and s.availability[t][d][p]]
                if gaps:
                    errs.append(f"{t}: окно {DAY_LABELS[d]} на уроке {[g + 1 for g in gaps]}")

    relaxed_keys = {tuple(r.split(":")[0].split(" ", 1)) for r in relaxed}
    cs = defaultdict(list)
    for mi, mt in enumerate(s.meetings):
        for c in mt.classes:
            for sj in mt.class_subjects(c):
                cs[(c, sj)].append(mi)
    cross_classes = {c for mt in s.meetings if "|cross|" in mt.id for c in mt.classes}
    for c in cross_classes:
        per_sub = defaultdict(list)
        for mi, mt in enumerate(s.meetings):
            for sec in mt.sections:
                for cc, sub, sj in sec.attendees:
                    if cc == c and sj in CROSS_SUBJECTS:
                        per_sub[(sub, sj)].append(slot_of[mi][0])
        for (sub, sj), days in per_sub.items():
            if len(days) != len(set(days)):
                errs.append(f"{c} {sub} {sj}: два урока в один день")
        pair = [mi for mi, mt in enumerate(s.meetings) if c in mt.classes and "|cross|" in mt.id
                and {a[2] for sec in mt.sections for a in sec.attendees} == CROSS_SUBJECTS]
        if len(pair) == 2 and slot_of[pair[0]][0] != slot_of[pair[1]][0]:
            errs.append(f"{c}: перекрёстные уроки информатики и английского в разные дни")
    for (c, sj), mis in cs.items():
        if c in cross_classes and sj in CROSS_SUBJECTS:
            continue
        n = len(mis)
        lim = 1 if n <= DAYS else 2
        forced_double = (c, sj) in relaxed_keys
        if forced_double:
            lim = 2
        for d in range(DAYS):
            ps = sorted(slot_of[mi][1] for mi in mis if slot_of[mi][0] == d)
            if len(ps) > lim:
                errs.append(f"{c} {sj}: {len(ps)} урока в {DAY_LABELS[d]}")
            if forced_double:
                if len(ps) == 2 and ps[1] - ps[0] != 1:
                    errs.append(f"{c} {sj}: два урока в {DAY_LABELS[d]} не подряд")
            elif any(b - a == 1 for a, b in zip(ps, ps[1:])):
                errs.append(f"{c} {sj}: сдвоенный урок в {DAY_LABELS[d]}")
    for c in s.classes:
        if grade_of(c) <= 4:
            continue
        for dom, subjects in DOMAINS.items():
            present = [sj for sj in subjects if (c, sj) in cs]
            if len(present) < 2:
                continue
            mis = sorted({mi for sj in present for mi in cs[(c, sj)]})
            for d in range(DAYS):
                ps = sorted(slot_of[mi][1] for mi in mis if slot_of[mi][0] == d)
                if len(mis) <= DAYS and len(ps) > 1:
                    errs.append(f"{c} домен {dom}: {len(ps)} урока в {DAY_LABELS[d]}")
                if len(ps) == 2 and ps[1] - ps[0] != 1:
                    errs.append(f"{c} домен {dom}: два урока в {DAY_LABELS[d]} не подряд")
                if len(ps) > 2:
                    errs.append(f"{c} домен {dom}: {len(ps)} урока в {DAY_LABELS[d]}")

    for mi, mt in enumerate(s.meetings):
        d, p = slot_of[mi]
        subj = {a[2] for sec in mt.sections for a in sec.attendees}
        if subj & MATH:
            sh = 1 if (mt.teachers & set(math_one_later_teachers) and
                       (math_one_later_days is None or d in math_one_later_days)) else 0
            if p >= 5 + sh or (d in (0, 4) and p >= 4 + sh):
                errs.append(f"{mt.id}: математика на {p + 1} уроке {DAY_LABELS[d]}")
            if d == 0 and subj & GEOMETRY:
                errs.append(f"{mt.id}: геометрия в понедельник")
            if d == 1 and subj & ALGEBRA:
                errs.append(f"{mt.id}: алгебра во вторник")
        for c in mt.classes:
            if s.class_type.get(c) == "luo" and p >= 6:
                errs.append(f"{mt.id}: ЛУО позже 6-го урока")

    for mi, si, d, p, room in pl:
        sec = s.meetings[mi].sections[si]
        if sec.teacher == BABICH and room != BABICH_ROOM:
            chem_here = any(
                slot_of[mj] == (d, p) and any(x.teacher == KRASNOPEROVA and CHEMISTRY in x.subjects
                                              for x in s.meetings[mj].sections)
                for mj in range(len(s.meetings)))
            if not chem_here:
                errs.append(f"Бабич не в своём кабинете {DAY_LABELS[d]} {p + 1} без химии Красноперовой")

    # часы по нагрузке
    got = defaultdict(int)
    for mi, mt in enumerate(s.meetings):
        for sec in mt.sections:
            for c, sub, sj in sec.attendees:
                got[(c, sj, sub, sec.teacher)] += 1
    for e in s.curriculum_entries:
        for t in e["teachers"]:
            key = (e["class_name"], e["subject_name"], t.get("subgroup"), t["fio"])
            if got.get(key, 0) != e["weekly_hours"]:
                if e.get("subgroup_teachers"):
                    continue
                errs.append(f"часы {key}: {got.get(key, 0)} вместо {e['weekly_hours']}")
    return errs


def metrics(school: School, res: dict) -> dict:
    s = school
    pl = placements(s, res)
    busy = defaultdict(set)
    rooms_of = {}
    subj_of = {}
    for mi, si, d, p, room in pl:
        sec = s.meetings[mi].sections[si]
        busy[(sec.teacher, d)].add(p)
        rooms_of[(sec.teacher, d, p)] = room
        subj_of[(sec.teacher, d, p)] = (sec, mi)
    win = {}
    for (t, d), ps in busy.items():
        w = sum(1 for p in range(min(ps), max(ps)) if p not in ps and s.availability[t][d][p])
        win[t] = win.get(t, 0) + w
    total_win = sum(win.values())

    class_days = defaultdict(list)
    late = 0
    eighth = 0
    for c in s.classes:
        for d in range(DAYS):
            ps = sorted({p for mi, mt in enumerate(s.meetings) if c in mt.classes
                         for (dd, p) in [tuple(res["slots"][str(mi)])] if dd == d})
            class_days[c].append(len(ps))
            if ps and ps[0] > 0:
                late += 1
            if ps and ps[-1] == 7:
                eighth += 1

    bab = []
    for d in range(DAYS):
        ps = sorted(busy.get((BABICH, d), []))
        if not ps:
            bab.append(f"{DAY_LABELS[d]}: нет уроков")
            continue
        gaps = [p for p in range(ps[0], ps[-1]) if p not in ps]
        gap_txt = []
        for g in gaps:
            sec_mi = subj_of.get((ALEKPAROVA, d, g))
            if sec_mi and rooms_of.get((ALEKPAROVA, d, g)) == BABICH_ROOM:
                cls = ",".join(sorted({a[0] for a in sec_mi[0].attendees}))
                gap_txt.append(f"{g + 1}(англ. {cls} в каб.17)")
            else:
                gap_txt.append(f"{g + 1}")
        bab.append(f"{DAY_LABELS[d]}: уроки {ps[0] + 1}–{ps[-1] + 1}, всего {len(ps)}"
                   + (f", окно: {', '.join(gap_txt)}" if gaps else ""))
    swaps = []
    for (t, d, p), room in sorted(rooms_of.items(), key=lambda kv: (kv[0][1], kv[0][2])):
        if t == BABICH and room != BABICH_ROOM:
            sec, _ = subj_of[(t, d, p)]
            swaps.append(f"{DAY_LABELS[d]} {p + 1} урок: химия Красноперовой в каб.17, Бабич "
                         f"({', '.join(sorted(sec.subjects))} {','.join(sorted({a[0] for a in sec.attendees}))}) в каб.19")
    three_lang = []
    for c in s.classes:
        if grade_of(c) > 4:
            continue
        for d in range(DAYS):
            langs = set()
            for mi, mt in enumerate(s.meetings):
                if c in mt.classes and res["slots"][str(mi)][0] == d:
                    for sj in mt.class_subjects(c):
                        lg = language_of(sj, s.class_lang.get(c, "ru"))
                        if lg:
                            langs.add(lg)
            if len(langs) >= 3:
                three_lang.append(f"{c} {DAY_LABELS[d]}")
    alia = []
    for mi, mt in enumerate(s.meetings):
        for si, sec in enumerate(mt.sections):
            if sec.teacher == ALEKPAROVA and {a[0] for a in sec.attendees} & {"9Б", "10А"}:
                d, p = res["slots"][str(mi)]
                ps = busy.get((BABICH, d), set())
                in_win = bool(ps) and p not in ps and min(ps) < p < max(ps)
                room = res["rooms"][f"{mi}|{si}"]
                alia.append(f"{DAY_LABELS[d]} {p + 1} урок: {','.join(sorted({a[0] for a in sec.attendees}))} — "
                            + ("в окне Бабича, каб.17" if in_win and room == BABICH_ROOM else
                               "в окне Бабича" if in_win else "не в окне Бабича"))
    alia.sort(key=lambda t: (DAY_LABELS.index(t[:2]), t))
    return {
        "teacher_windows_total": total_win,
        "teacher_windows": dict(sorted(win.items(), key=lambda kv: -kv[1])),
        "class_day_counts": dict(class_days),
        "late_starts": late,
        "eighth_lessons": eighth,
        "babich_days": bab,
        "chem_swaps": swaps,
        "primary_three_languages": three_lang,
        "alia_9b_10a": alia,
    }

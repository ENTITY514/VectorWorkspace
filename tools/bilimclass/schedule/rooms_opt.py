"""Перераскладка кабинетов при неизменном времени уроков: минимум переходов у учителей.

  python rooms_opt.py V10 V11

Время всех уроков берётся из исходной версии. Кабинеты Бабича, английского Алекпаровой в каб.17,
спортзалов и лабораторий не меняются. Для остальных уроков с выбором кабинета минимизируется:
  1) число смен кабинета между соседними уроками учителя в течение дня;
  2) число разных кабинетов у учителя за неделю;
  3) (слабо) начальные классы не в своём кабинете, совместители не в профильном кабинете.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from dataclasses import replace

from ortools.sat.python import cp_model

from dataset import ALEKPAROVA, BABICH, BABICH_ROOM, BIG_GYM, FALLBACK_ROOMS, build, grade_of, load
from model import Profile
from run_variants import OUT, PROFILES
from verify import metrics, verify

W_CHANGE, W_DISTINCT, W_SOFT = 10, 3, 1
W_KEEP = 2  # при keep_rooms: смена кабинета относительно исходной версии
W_FALLBACK = 0
W_LAB = 50  # химия не в кабинете химии, когда он свободен  # обычный урок в лаборатории/мастерской — только если обычные кабинеты заняты
W_HOME = 100  # урок в 1–4 классе у учителя без своего кабинета — не в кабинете класса (учитель идёт к детям)


def teacher_moves(school, res):
    """учитель → (смен кабинета за неделю, разных кабинетов)."""
    seq = defaultdict(list)
    for mi, mt in enumerate(school.meetings):
        d, p = res["slots"][str(mi)]
        for si, sec in enumerate(mt.sections):
            seq[sec.teacher].append((d, p, res["rooms"][f"{mi}|{si}"]))
    out = {}
    for t, items in seq.items():
        items.sort()
        ch = sum(1 for a, b in zip(items, items[1:]) if a[0] == b[0] and a[2] != b[2])
        out[t] = (ch, len({x[2] for x in items}))
    return out


def optimize(src: str, dst: str, time_limit=120, title: str | None = None, note: str = "",
             keep_rooms: bool = False, forbid_rooms: dict | None = None):
    school = build()
    res = json.loads((OUT / f"{src}.json").read_text(encoding="utf-8"))
    forbid = {t: set(v) for t, v in (res.get("profile", {}).get("forbid_rooms") or {}).items()}
    for t, v in (forbid_rooms or {}).items():
        forbid.setdefault(t, set()).update(v)
    m = cp_model.CpModel()
    keep_terms = []
    fixed_room = {}
    choice = {}
    for mi, mt in enumerate(school.meetings):
        for si, sec in enumerate(mt.sections):
            cur = res["rooms"][f"{mi}|{si}"]
            keep = (len(sec.rooms) == 1 or sec.teacher == BABICH or BIG_GYM in sec.rooms
                    or (sec.teacher == ALEKPAROVA and cur == BABICH_ROOM))
            if keep:
                fixed_room[(mi, si)] = sec.rooms[0] if len(sec.rooms) == 1 else cur
            else:
                choice[(mi, si)] = {r: m.NewBoolVar(f"r{mi}_{si}_{r}") for r in sec.rooms
                                    if r not in forbid.get(sec.teacher, ())}
                m.AddExactlyOne(choice[(mi, si)].values())
                if cur in choice[(mi, si)]:
                    m.AddHint(choice[(mi, si)][cur], 1)
                    if keep_rooms:
                        keep_terms.append(1 - choice[(mi, si)][cur])

    occ = defaultdict(list)  # (room, d, p) → литералы/константы
    for (mi, si), r in fixed_room.items():
        d, p = res["slots"][str(mi)]
        occ[(r, d, p)].append(1)
    for (mi, si), vs in choice.items():
        d, p = res["slots"][str(mi)]
        for r, v in vs.items():
            occ[(r, d, p)].append(v)
    for key, items in occ.items():
        const = sum(1 for x in items if isinstance(x, int))
        lits = [x for x in items if not isinstance(x, int)]
        if const > 1:
            raise ValueError(f"исходная версия с накладкой кабинета {key}")
        if lits:
            m.Add(sum(lits) <= 1 - const)

    def room_expr(key, r):
        if key in fixed_room:
            return 1 if fixed_room[key] == r else 0
        return choice[key].get(r, 0)

    obj = []
    seq = defaultdict(list)
    for mi, mt in enumerate(school.meetings):
        d, p = res["slots"][str(mi)]
        for si, sec in enumerate(mt.sections):
            seq[(sec.teacher, d)].append((p, (mi, si)))
    rooms_of_teacher = defaultdict(set)
    for (t, d), items in seq.items():
        items.sort()
        for _, key in items:
            rooms_of_teacher[t] |= set(choice[key]) if key in choice else {fixed_room[key]}
        for (_, a), (_, b) in zip(items, items[1:]):
            if a not in choice and b not in choice:
                continue
            ch = m.NewBoolVar("ch")
            for r in rooms_of_teacher[t] | set(choice.get(a, {})) | set(choice.get(b, {})):
                ea, eb = room_expr(a, r), room_expr(b, r)
                if isinstance(ea, int) and isinstance(eb, int):
                    if ea != eb:
                        m.Add(ch == 1)
                    continue
                m.Add(ch >= ea - eb)
            obj.append(W_CHANGE * ch)
    for t in rooms_of_teacher:
        keys = [k for (tt, d), items in seq.items() if tt == t for _, k in items if k in choice]
        if not keys:
            continue
        for r in rooms_of_teacher[t]:
            lits = [choice[k][r] for k in keys if r in choice[k]]
            if not lits:
                continue
            u = m.NewBoolVar("u")
            m.AddMaxEquality(u, lits)
            obj.append(W_DISTINCT * u)
    for (mi, si), vs in choice.items():
        sec = school.meetings[mi].sections[si]
        for r, v in vs.items():
            if r not in sec.preferred_rooms and (any(grade_of(c) <= 4 for c in school.meetings[mi].classes)
                                                  or r != sec.preferred_rooms[0]):
                obj.append(W_SOFT * v)
    for (mi, si), vs in choice.items():
        sec = school.meetings[mi].sections[si]
        for r in FALLBACK_ROOMS:
            if r in vs and r not in sec.preferred_rooms and r not in sec.swap_penalty_rooms:
                obj.append(W_FALLBACK * vs[r])
    for (mi, si), vs in choice.items():  # химия — в кабинете химии, если он свободен
        sec = school.meetings[mi].sections[si]
        if "Химия" in sec.subjects and BABICH_ROOM in vs:
            obj.append(W_LAB * (1 - vs[BABICH_ROOM]))
    home = load("room_rules.json")["home_rooms"]
    for (mi, si), vs in choice.items():
        sec = school.meetings[mi].sections[si]
        homes = {home[c] for c in school.meetings[mi].classes if c in home} & set(vs)
        if homes:
            obj.append(W_HOME * (1 - sum(vs[h] for h in homes)))
    m.Minimize(sum(obj) + W_KEEP * sum(keep_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = 8
    st = solver.Solve(m)
    print("статус:", solver.StatusName(st), "штраф:", solver.ObjectiveValue())
    new = dict(res)
    new["rooms"] = dict(res["rooms"])
    for (mi, si), r in fixed_room.items():
        new["rooms"][f"{mi}|{si}"] = r
    for (mi, si), vs in choice.items():
        new["rooms"][f"{mi}|{si}"] = next(r for r, v in vs.items() if solver.Value(v))

    src_prof = Profile(**res["profile"]) if "profile" in res else PROFILES[src]  # с закреплениями этого прогона
    prof = replace(src_prof, forbid_rooms={t: sorted(v) for t, v in forbid.items()}, name=dst, title=title or f"Версия {dst[1:]} ({src} + кабинеты без лишних переходов)",
                   description=f"Время всех уроков — как в {src}. Кабинеты учителей без своего кабинета "
                               f"переразложены так, чтобы было меньше переходов между уроками и меньше разных "
                               f"кабинетов за неделю. Кабинеты спортзалов, лабораторий и закреплённые кабинеты не менялись. "
                               f"{note}{src_prof.description}")
    PROFILES[dst] = prof
    start_hard = {c for c in school.classes if (prof.primary_start_hard and grade_of(c) <= 4)
                  or (prof.start_hard_except is not None and c not in prof.start_hard_except)}
    new["hard_violations"] = verify(school, new, new["relaxed_daily"], no_window_teachers=prof.no_window_teachers,
                                    start_hard_classes=start_hard, balanced_hard=prof.balanced_hard, pins=prof.pins,
                                    babich_windows_at=prof.babich_windows_at,
                                    alia_all_in_babich_windows=prof.alia_all_in_babich_windows,
                                    math_one_later_teachers=prof.math_one_later_teachers,
                                    math_one_later_days=prof.math_one_later_days,
                                    teacher_day_cap=prof.teacher_day_cap, low_teachers=prof.window_low_teachers,
                                    natural_not_adjacent=prof.natural_not_adjacent,
                                    cap_exempt=prof.teacher_cap_exempt, natural_exempt=prof.natural_exempt_classes,
                                    babich_no_swap_classes=prof.babich_no_swap_classes)
    new["metrics"] = metrics(school, new)
    new["profile"] = {k: v for k, v in prof.__dict__.items() if k != "extra"}
    before, after = teacher_moves(school, res), teacher_moves(school, new)
    new["room_moves"] = {t: {"before": before[t], "after": after[t]} for t in before}
    (OUT / f"{dst}.json").write_text(json.dumps(new, ensure_ascii=False), encoding="utf-8")
    print("нарушений жёстких правил:", len(new["hard_violations"]))
    tb = sum(v[0] for v in before.values())
    ta = sum(v[0] for v in after.values())
    print(f"смен кабинета за неделю: {tb} → {ta}")
    for t in sorted(before, key=lambda t: -(before[t][0] - after[t][0])):
        if before[t] != after[t]:
            print(f"  {t}: смен {before[t][0]} → {after[t][0]}, разных кабинетов {before[t][1]} → {after[t][1]}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) > 3:
        optimize(sys.argv[1], sys.argv[2], title=sys.argv[3], note=(sys.argv[4] + " ") if len(sys.argv) > 4 else "",
                 keep_rooms=True)
    else:
        optimize(sys.argv[1], sys.argv[2])

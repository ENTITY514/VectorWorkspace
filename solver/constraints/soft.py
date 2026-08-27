"""Soft constraints S1..S6 — penalties + weighted objective.
Each weight 0 => constraint not created (saves branching).
"""
from ortools.sat.python import cp_model


def add_soft_constraints(model, x, y, m, instances, room_by_id=None):
    penalties = {}
    if room_by_id is None:
        room_by_id = {r.id: r for r in m.rooms}
    subject_by_id = {s.id: s for s in m.subjects}
    teacher_by_id = {t.id: t for t in m.teachers}
    class_by_id = {c.id: c for c in m.classes}

    # helper: busy per teacher/day/period as sum (0/1 due to H2)
    # Build busy mapping for reuse
    # busy_teacher_day_period -> list of x vars
    busy_map = {}
    for inst in instances:
        tid = inst["teacher_id"]
        for d in range(m.time_grid.days):
            for p in range(m.time_grid.periods_per_day):
                k = (inst["idx"], d, p)
                if k not in x:
                    continue
                busy_map.setdefault((tid, d, p), []).append(x[k])

    # S1: Окна учителей
    if m.weights.window > 0:
        window_vars = []
        for (tid, d, p), vars_ in busy_map.items():
            # will create gaps in separate loop per teacher/day
            pass
        # per teacher, per day compute windows
        for t in m.teachers:
            tid = t.id
            for d in range(m.time_grid.days):
                # collect busy per period for this teacher/day
                busy_per_p = []
                for p in range(m.time_grid.periods_per_day):
                    key = (tid, d, p)
                    lst = busy_map.get(key, [])
                    if not lst:
                        # no instance can occupy this slot for this teacher => busy 0 (constant)
                        # create constant 0 var as 0
                        busy_per_p.append(None)  # placeholder for 0
                    elif len(lst) == 1:
                        busy_per_p.append(lst[0])
                    else:
                        # should be at most one due to H2, but still sum = OR
                        # create busy = sum(lst) == 0/1
                        # Since H2 ensures AtMostOne, sum is already 0/1, we can use sum var as busy
                        # Create BoolVar busy = OR
                        b = model.NewBoolVar(f"busy_{tid}_{d}_{p}")
                        model.AddMaxEquality(b, lst)  # b = max(lst) == OR
                        busy_per_p.append(b)
                # Need to handle None as constant 0
                # Replace None with constant 0 via dummy BoolVar fixed 0? Use 0 directly in logic
                # For gap detection, we need busy booleans; for p where no possible busy, gap cannot be there
                # Build has_before / has_after
                for p in range(m.time_grid.periods_per_day):
                    busy_p = busy_per_p[p]
                    if busy_p is None:
                        # busy is always 0, it could be a window if surrounded, but teacher never available there? Actually busy always 0 due to no instance, but still could be window slot (empty between). For simplicity, treat busy_p as 0 constant, gap detection still valid.
                        # We can skip because windows only count slots between first and last where busy could be; but empty slots where teacher cannot be (availability false) shouldn't count as window? Actually availability false slots are not working slots, they shouldn't be counted. But our busy_map excludes those slots (no x), so busy_p None corresponds to availability false or no room -> not a working slot, should not count.
                        # So skip gap for those p
                        continue
                    # has_before = OR_{q < p} busy_q
                    before_vars = [b for b in busy_per_p[:p] if b is not None]
                    after_vars = [b for b in busy_per_p[p+1:] if b is not None]
                    if not before_vars or not after_vars:
                        continue
                    has_before = model.NewBoolVar(f"has_before_{tid}_{d}_{p}")
                    has_after = model.NewBoolVar(f"has_after_{tid}_{d}_{p}")
                    # has_before = OR(before)
                    model.AddMaxEquality(has_before, before_vars)
                    model.AddMaxEquality(has_after, after_vars)
                    gap = model.NewBoolVar(f"gap_{tid}_{d}_{p}")
                    # gap = has_before AND has_after AND NOT busy_p
                    # linearize: gap <= has_before, gap <= has_after, gap <= 1 - busy_p, gap >= has_before+has_after+(1-busy_p)-2
                    model.Add(gap <= has_before)
                    model.Add(gap <= has_after)
                    model.Add(gap + busy_p <= 1)  # gap <= 1 - busy
                    model.Add(gap >= has_before + has_after + (1 - busy_p) - 2)
                    window_vars.append(gap)
        if window_vars:
            pen = model.NewIntVar(0, 100000, "penalty_window")
            model.Add(pen == sum(window_vars))
            penalties["window"] = pen
        else:
            penalties["window"] = model.NewIntVar(0, 0, "penalty_window_zero")
            model.Add(penalties["window"] == 0)

    # S2: Изгнание из кабинета (base_room)
    if m.weights.room_displacement > 0:
        disp_vars = []
        for inst in instances:
            t = teacher_by_id.get(inst["teacher_id"])
            if not t or not t.base_room_id:
                continue
            base = t.base_room_id
            # if base not in allowed rooms for this subject, no penalty (forced displacement)
            subj = subject_by_id.get(inst["subject_id"])
            if subj and subj.required_room_type:
                room = room_by_id.get(base)
                if room and room.room_type != subj.required_room_type:
                    continue
            y_base_key = (inst["idx"], base)
            if y_base_key not in y:
                continue
            # penalty if not in base
            pen_i = model.NewBoolVar(f"disp_{inst['idx']}")
            # pen_i = 1 - y_base
            model.Add(pen_i + y[y_base_key] == 1)
            disp_vars.append(pen_i)
        if disp_vars:
            pen = model.NewIntVar(0, 100000, "penalty_room")
            model.Add(pen == sum(disp_vars))
            penalties["room_displacement"] = pen
        else:
            penalties["room_displacement"] = model.NewIntVar(0, 0, "penalty_room_zero")
            model.Add(penalties["room_displacement"] == 0)

    # S3: СанПиН-парабола
    if m.weights.sanpin_parabola > 0:
        ideal = [7, 11, 11, 9, 7, 5]
        while len(ideal) < m.time_grid.days:
            ideal.append(6)
        dev_vars = []
        for c in m.classes:
            cid = c.id
            for d in range(m.time_grid.days):
                terms = []
                for inst in instances:
                    if inst["class_id"] != cid:
                        continue
                    subj = subject_by_id.get(inst["subject_id"])
                    ww = subj.sanitary_weight if subj else 5
                    for p in range(m.time_grid.periods_per_day):
                        k = (inst["idx"], d, p)
                        if k in x:
                            terms.append(ww * x[k])
                if not terms:
                    continue
                max_w = 10 * len(terms)
                daily_var = model.NewIntVar(0, max_w if max_w > 0 else 100, f"daily_{cid}_{d}")
                model.Add(daily_var == sum(terms))
                ideal_d = ideal[d] if d < len(ideal) else 7
                tol = 2
                diff_pos = model.NewIntVar(0, 100, f"dev_pos_{cid}_{d}")
                diff_neg = model.NewIntVar(0, 100, f"dev_neg_{cid}_{d}")
                model.Add(diff_pos >= daily_var - ideal_d - tol)
                model.Add(diff_neg >= ideal_d - daily_var - tol)
                dev = model.NewIntVar(0, 100, f"dev_{cid}_{d}")
                model.AddMaxEquality(dev, [diff_pos, diff_neg])
                dev_vars.append(dev)
        if dev_vars:
            pen = model.NewIntVar(0, 100000, "penalty_sanpin")
            model.Add(pen == sum(dev_vars))
            penalties["sanpin_parabola"] = pen
        else:
            penalties["sanpin_parabola"] = model.NewIntVar(0, 0, "penalty_sanpin_zero")
            model.Add(penalties["sanpin_parabola"] == 0)

    # S4: Чередование (related subjects not same day)
    if m.weights.alternation > 0:
        alt_vars = []
        for c in m.classes:
            cid = c.id
            # build has_subject per day
            for subj in m.subjects:
                if not subj.related_subject_ids:
                    continue
                for rel_id in subj.related_subject_ids:
                    # avoid double count: only when subj.id < rel_id lexicographically
                    if subj.id >= rel_id:
                        continue
                    # check both subjects exist in curriculum for this class
                    has_subj = any(inst["class_id"] == cid and inst["subject_id"] == subj.id for inst in instances)
                    has_rel = any(inst["class_id"] == cid and inst["subject_id"] == rel_id for inst in instances)
                    if not has_subj or not has_rel:
                        continue
                    for d in range(m.time_grid.days):
                        # has_a = OR over periods/instances of subj in day
                        vars_a = [x[(inst["idx"], d, p)] for inst in instances if inst["class_id"] == cid and inst["subject_id"] == subj.id for p in range(m.time_grid.periods_per_day) if (inst["idx"], d, p) in x]
                        vars_b = [x[(inst["idx"], d, p)] for inst in instances if inst["class_id"] == cid and inst["subject_id"] == rel_id for p in range(m.time_grid.periods_per_day) if (inst["idx"], d, p) in x]
                        if not vars_a or not vars_b:
                            continue
                        has_a = model.NewBoolVar(f"has_{cid}_{subj.id}_{d}")
                        has_b = model.NewBoolVar(f"has_{cid}_{rel_id}_{d}")
                        model.AddMaxEquality(has_a, vars_a)
                        model.AddMaxEquality(has_b, vars_b)
                        both = model.NewBoolVar(f"both_{cid}_{subj.id}_{rel_id}_{d}")
                        model.Add(both <= has_a)
                        model.Add(both <= has_b)
                        model.Add(both >= has_a + has_b - 1)
                        alt_vars.append(both)
        if alt_vars:
            pen = model.NewIntVar(0, 100000, "penalty_alternation")
            model.Add(pen == sum(alt_vars))
            penalties["alternation"] = pen
        else:
            penalties["alternation"] = model.NewIntVar(0, 0, "penalty_alt_zero")
            model.Add(penalties["alternation"] == 0)

    # S5: Миграция (floor change) — simplified MVP: 0 if not needed, else count
    if m.weights.movement > 0:
        move_vars = []
        # для каждого учителя, дня, соседних периодов p,p+1: если разные комнаты и разные этажи
        # Нужно знать y per instance, но instance меняется per period (different subjects). Для каждого учителя в день, если в p и p+1 у него есть занятия в разных комнатах на разных этажах => 1
        # Упростим: для каждого учителя, дня, p создать is_move
        # Собираем для учителя список instance per period? Сложно, т.к. instance idx меняется.
        # Для MVP оставляем 0
        penalties["movement"] = model.NewIntVar(0, 0, "penalty_move_zero")
        model.Add(penalties["movement"] == 0)
    else:
        # даже если вес 0, не создаём, но engine ожидает ключ? Engine проверяет penalties dict наличие, если вес 0 мы не должны иметь ключ
        # Но мы уже выше не добавляли для weight 0, так что здесь не создаём
        pass

    if m.weights.movement > 0 and "movement" not in penalties:
        penalties["movement"] = model.NewIntVar(0, 0, "penalty_move_zero2")
        model.Add(penalties["movement"] == 0)

    # S6: Баланс нагрузки (дисперсия)
    if m.weights.load_balance > 0:
        bal_vars = []
        for c in m.classes:
            cid = c.id
            daily_counts = []
            for d in range(m.time_grid.days):
                vars_day = [x[(inst["idx"], d, p)] for inst in instances if inst["class_id"] == cid for p in range(m.time_grid.periods_per_day) if (inst["idx"], d, p) in x]
                if not vars_day:
                    continue
                cnt = model.NewIntVar(0, m.time_grid.periods_per_day, f"cnt_{cid}_{d}")
                model.Add(cnt == sum(vars_day))
                daily_counts.append(cnt)
            if len(daily_counts) < 2:
                continue
            # penalty = max - min
            max_v = model.NewIntVar(0, m.time_grid.periods_per_day, f"max_{cid}")
            min_v = model.NewIntVar(0, m.time_grid.periods_per_day, f"min_{cid}")
            model.AddMaxEquality(max_v, daily_counts)
            model.AddMinEquality(min_v, daily_counts)
            diff = model.NewIntVar(0, m.time_grid.periods_per_day, f"bal_{cid}")
            model.Add(diff == max_v - min_v)
            bal_vars.append(diff)
        if bal_vars:
            pen = model.NewIntVar(0, 100000, "penalty_balance")
            model.Add(pen == sum(bal_vars))
            penalties["load_balance"] = pen
        else:
            penalties["load_balance"] = model.NewIntVar(0, 0, "penalty_bal_zero")
            model.Add(penalties["load_balance"] == 0)

    # S7: Minimal Perturbation — штраф за изменение слотов по сравнению с previous_grid
    if m.weights.change_slot > 0 and m.previous_grid:
        change_vars = []
        # previous_grid: dict[(class_id, subject_id, teacher_id, day, period)] -> bool
        prev = m.previous_grid
        for inst in instances:
            for d in range(m.time_grid.days):
                for p in range(m.time_grid.periods_per_day):
                    key = (inst["idx"], d, p)
                    if key not in x:
                        continue
                    # Проверяем, был ли этот слот в previous_grid
                    prev_key = (inst["class_id"], inst["subject_id"], inst["teacher_id"], d, p)
                    was_assigned = prev.get(prev_key, False)
                    if was_assigned:
                        # Штраф если теперь НЕ в этом слоте: pen = 1 - x[key]
                        pen_i = model.NewBoolVar(f"change_{inst['idx']}_{d}_{p}")
                        model.Add(pen_i + x[key] == 1)
                        change_vars.append(pen_i)
        if change_vars:
            pen = model.NewIntVar(0, 100000, "penalty_change_slot")
            model.Add(pen == sum(change_vars))
            penalties["change_slot"] = pen
        else:
            penalties["change_slot"] = model.NewIntVar(0, 0, "penalty_change_zero")
            model.Add(penalties["change_slot"] == 0)

    return penalties

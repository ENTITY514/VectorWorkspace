"""CP-SAT engine: build model, solve, diagnostics."""
import time
from collections import defaultdict

from ortools.sat.python import cp_model

try:
    from solver.schema import InputModel
    from solver.constraints.hard import add_hard_constraints
    from solver.constraints.soft import add_soft_constraints
except ImportError:
    from schema import InputModel
    from constraints.hard import add_hard_constraints
    from constraints.soft import add_soft_constraints


def create_variables(model, m):
    """Создаёт x[i,d,p] и y[i,room] с предфильтром availability/room_type/ shift."""
    room_by_id = {r.id: r for r in m.rooms}
    subject_by_id = {s.id: s for s in m.subjects}
    teacher_by_id = {t.id: t for t in m.teachers}
    class_by_id = {c.id: c for c in m.classes}

    # Разворачиваем curriculum в instances
    instances = []
    idx = 0
    joint_hour_offset: dict[tuple[str, str], int] = {}
    for entry in m.curriculum:
        subj = subject_by_id.get(entry.subject_id)
        if subj is None:
            continue
        is_split = subj.requires_split
        hours = entry.hours_per_week
        joint_id = getattr(entry, "joint_lesson_id", None)
        base_h_offset = 0
        if joint_id:
            key_cj = (entry.class_id, joint_id)
            base_h_offset = joint_hour_offset.get(key_cj, 0)
            joint_hour_offset[key_cj] = base_h_offset + hours

        for h in range(hours):
            j_h_idx = base_h_offset + h
            if is_split:
                # два instance с одним split_key
                sk = f"{entry.class_id}|{entry.subject_id}|{h}"
                instances.append({
                    "idx": idx,
                    "class_id": entry.class_id,
                    "subject_id": entry.subject_id,
                    "teacher_id": entry.teacher_id,
                    "subgroup_label": "1гр",
                    "split_key": sk,
                    "requires_split": True,
                    "joint_lesson_id": joint_id,
                    "joint_hour_index": j_h_idx,
                })
                idx += 1
                instances.append({
                    "idx": idx,
                    "class_id": entry.class_id,
                    "subject_id": entry.subject_id,
                    "teacher_id": entry.split_teacher2_id,
                    "subgroup_label": "2гр",
                    "split_key": sk,
                    "requires_split": True,
                    "joint_lesson_id": joint_id,
                    "joint_hour_index": j_h_idx,
                })
                idx += 1
            else:
                instances.append({
                    "idx": idx,
                    "class_id": entry.class_id,
                    "subject_id": entry.subject_id,
                    "teacher_id": entry.teacher_id,
                    "subgroup_label": "",
                    "split_key": None,
                    "requires_split": False,
                    "joint_lesson_id": joint_id,
                    "joint_hour_index": j_h_idx,
                })
                idx += 1

    x = {}
    y = {}
    # запомним для каждого instance список доступных комнат (для ранней диагностики)
    allowed_rooms_by_idx: dict[int, list[str]] = {}

    for inst in instances:
        teacher = teacher_by_id.get(inst["teacher_id"])
        subj = subject_by_id.get(inst["subject_id"])
        cls = class_by_id.get(inst["class_id"])
        if teacher is None or subj is None or cls is None:
            allowed_rooms_by_idx[inst["idx"]] = []
            continue
        # предфильтр по required_room_type: допустимые комнаты (специализированные + fallback General / базовый)
        allowed_rooms = []
        req_type = subj.required_room_type
        for rid, room in room_by_id.items():
            if req_type is not None:
                # Включаем специализированные кабинеты, а также общие (General) и базовый кабинет учителя как фоллбэк
                is_spec = room.room_type == req_type
                is_general = room.room_type == "General" or room.room_type == "Стандартный"
                is_teacher_base = teacher.base_room_id is not None and rid == teacher.base_room_id
                if not (is_spec or is_general or is_teacher_base):
                    continue
            allowed_rooms.append(rid)
        allowed_rooms_by_idx[inst["idx"]] = allowed_rooms
        for rid in allowed_rooms:
            y[(inst["idx"], rid)] = model.NewBoolVar(f"y_{inst['idx']}_{rid}")

        for d in range(m.time_grid.days):
            for p in range(m.time_grid.periods_per_day):
                # availability
                if d < len(teacher.availability) and p < len(teacher.availability[d]):
                    if not teacher.availability[d][p]:
                        continue
                # смены
                if m.time_grid.periods_per_day >= 8:
                    if cls.shift == "First" and p >= 6:
                        continue
                    if cls.shift == "Second" and p < 2:
                        continue
                x[(inst["idx"], d, p)] = model.NewBoolVar(f"x_{inst['idx']}_{d}_{p}")

    return x, y, instances, room_by_id, subject_by_id


def build_infeasible_core(m):
    """Эвристика для diagnostics.infeasible_core — возвращает IIS с конкретными причинами."""
    reasons = []
    entities = []

    teacher_by_id = {t.id: t for t in m.teachers}
    subj_by_id = {s.id: s for s in m.subjects}

    # ─── 1. Учитель: requested > available (с учётом max_daily_lessons) ───
    avail_by_teacher: dict[str, int] = {}
    for t in m.teachers:
        max_daily = t.max_daily_lessons
        total = 0
        for day in t.availability:
            day_slots = sum(1 for v in day[:m.time_grid.periods_per_day] if v)
            if max_daily > 0:
                total += min(day_slots, max_daily)
            else:
                total += day_slots
        avail_by_teacher[t.id] = total

    requested_by_teacher: dict[str, int] = defaultdict(int)
    for e in m.curriculum:
        requested_by_teacher[e.teacher_id] += e.hours_per_week
        if e.split_teacher2_id:
            requested_by_teacher[e.split_teacher2_id] += e.hours_per_week

    for tid, req in requested_by_teacher.items():
        av = avail_by_teacher.get(tid, 0)
        if req > av:
            t = teacher_by_id.get(tid)
            name = t.full_name if t else tid
            reasons.append(
                f"Учитель «{name}»: {req} ч/нед нагрузки, но доступно лишь {av} слотов"
            )
            entities.append(tid)

    # ─── 2. Split: пересечение availability ───
    split_pairs_checked: set[tuple[str, str]] = set()
    for e in m.curriculum:
        if e.split_teacher2_id:
            pair = tuple(sorted([e.teacher_id, e.split_teacher2_id]))
            if pair in split_pairs_checked:
                continue
            split_pairs_checked.add(pair)

            t1 = teacher_by_id.get(e.teacher_id)
            t2 = teacher_by_id.get(e.split_teacher2_id)
            if t1 and t2:
                overlap = False
                for d in range(m.time_grid.days):
                    for p in range(m.time_grid.periods_per_day):
                        if (d < len(t1.availability) and p < len(t1.availability[d])
                                and d < len(t2.availability) and p < len(t2.availability[d])):
                            if t1.availability[d][p] and t2.availability[d][p]:
                                overlap = True
                                break
                    if overlap:
                        break
                if not overlap:
                    subj = subj_by_id.get(e.subject_id)
                    sname = subj.name if subj else e.subject_id
                    reasons.append(
                        f"Split-конфликт: «{t1.full_name}» и «{t2.full_name}» не имеют общих окон для «{sname}»"
                    )
                    entities.extend([e.teacher_id, e.split_teacher2_id])

    # ─── 3. Кабинеты спецтипа ───
    room_count_by_type: dict[str, int] = defaultdict(int)
    for r in m.rooms:
        room_count_by_type[r.room_type] += 1

    needed_by_type: dict[str, int] = defaultdict(int)
    for e in m.curriculum:
        s = subj_by_id.get(e.subject_id)
        if s and s.required_room_type:
            # split: обе подгруппы занимают кабинет типа одновременно → ×2
            multiplier = 2 if s.requires_split else 1
            needed_by_type[s.required_room_type] += e.hours_per_week * multiplier

    total_slots = m.time_grid.days * m.time_grid.periods_per_day
    for rt, need in needed_by_type.items():
        have = room_count_by_type.get(rt, 0) * total_slots
        if need > have:
            reasons.append(
                f"Кабинеты «{rt}»: нужно {need} ч/нед, но только {have} слотов "
                f"({room_count_by_type.get(rt, 0)} каб. × {total_slots})"
            )
            entities.append(f"room_type:{rt}")

    # ─── 4. Класс: суммарная нагрузка > слотов ───
    hours_by_class: dict[str, int] = defaultdict(int)
    for e in m.curriculum:
        hours_by_class[e.class_id] += e.hours_per_week

    for cid, hours in hours_by_class.items():
        if hours > total_slots:
            reasons.append(
                f"Класс {cid}: {hours} ч/нед, но.max {total_slots} слотов ({m.time_grid.days} × {m.time_grid.periods_per_day})"
            )
            entities.append(cid)

    if not reasons:
        reasons.append("Hard-ограничения противоречивы (availability, кабинеты или смены)")
        entities.append("unknown")

    return {
        "reason": "; ".join(reasons),
        "conflicting_entities": entities,
        "suggestion": "Расширьте availability, добавьте кабинеты спецтипа, снизьте часы или скорректируйте смены",
    }


def solve(input_model: InputModel) -> dict:
    start = time.time()
    model = cp_model.CpModel()
    x, y, instances, room_by_id, subject_by_id = create_variables(model, input_model)

    # Если нет instance — сразу FEASIBLE пустой
    if not instances:
        return {
            "schema_version": 2,
            "status": "OPTIMAL",
            "solver_stats": {"wall_ms": 0, "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0},
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0, "total": 0},
            "slots": [],
            "diagnostics": {"infeasible_core": None, "warnings": []},
        }

    # Если для какого-то instance нет доступных слотов или нет подходящих кабинетов -> сразу INFEASIBLE
    room_by_id_tmp = {r.id: r for r in input_model.rooms}
    subj_by_id_tmp = {s.id: s for s in input_model.subjects}
    teacher_by_id_tmp = {t.id: t for t in input_model.teachers}
    for inst in instances:
        has_x = any((inst["idx"], d, p) in x for d in range(input_model.time_grid.days) for p in range(input_model.time_grid.periods_per_day))
        has_y = any((inst["idx"], rid) in y for rid in room_by_id_tmp)
        subj = subj_by_id_tmp.get(inst["subject_id"])
        needs_room = subj is not None and subj.required_room_type is not None
        if not has_x or (needs_room and not has_y):
            core = build_infeasible_core(input_model)
            teacher = teacher_by_id_tmp.get(inst["teacher_id"])
            tname = teacher.full_name if teacher else inst["teacher_id"]
            sname = subj.name if subj else inst["subject_id"]
            if needs_room and not has_y:
                core["reason"] = (
                    f"Нет кабинета типа «{subj.required_room_type}» для предмета «{sname}» "
                    f"(класс {inst['class_id']}, учитель {tname})"
                )
                core["conflicting_entities"] = [f"room_type:{subj.required_room_type}", f"subject:{inst['subject_id']}"]
            elif not has_x:
                core["reason"] = (
                    f"Нет доступных слотов для «{sname}» — учитель «{tname}» не имеет окон "
                    f"(класс {inst['class_id']})"
                )
                core["conflicting_entities"] = [inst["teacher_id"], inst["class_id"]]
            return {
                "schema_version": 2,
                "status": "INFEASIBLE",
                "solver_stats": {"wall_ms": int((time.time()-start)*1000), "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0},
                "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0, "total": 0},
                "slots": [],
                "diagnostics": {"infeasible_core": core, "warnings": []},
            }

    add_hard_constraints(model, x, y, input_model, instances, room_by_id, subject_by_id)
    penalties = add_soft_constraints(model, x, y, input_model, instances, room_by_id)

    # Предупреждения: mismatches subject_ids учителя с curriculum
    warnings = []
    # Предупреждение о fixed lessons без matching instance
    for fixed in input_model.fixed_lessons:
        found = any(
            inst["class_id"] == fixed.class_id
            and inst["subject_id"] == fixed.subject_id
            and inst["teacher_id"] == fixed.teacher_id
            for inst in instances
        )
        if not found:
            warnings.append(
                f"Fixed lesson: class={fixed.class_id}, subject={fixed.subject_id}, "
                f"teacher={fixed.teacher_id} — нет matching instance в curriculum"
            )
    teacher_by_id = {t.id: t for t in input_model.teachers}
    for entry in input_model.curriculum:
        teacher = teacher_by_id.get(entry.teacher_id)
        if teacher and teacher.subject_ids:
            if entry.subject_id not in teacher.subject_ids:
                subj = subject_by_id.get(entry.subject_id)
                sname = subj.name if subj else entry.subject_id
                warnings.append(
                    f"Учитель «{teacher.full_name}» назначен на предмет «{sname}», "
                    f"но его нет в списке предметов учителя: {teacher.subject_ids}"
                )
    if penalties:
        # взвешенная сумма, вес 0 уже исключён в soft.py (ключ отсутствует), но для безопасности фильтруем
        weights = input_model.weights
        obj_terms = []
        for name, var in penalties.items():
            w = getattr(weights, name, 0)
            if w and w != 0:
                obj_terms.append(w * var)
        if obj_terms:
            model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(input_model.meta.time_limit_sec)
    solver.parameters.num_search_workers = int(input_model.meta.num_workers)
    solver.parameters.random_seed = int(input_model.meta.random_seed)
    # Не логировать в stdout

    status = solver.Solve(model)
    wall_ms = int((time.time() - start) * 1000)

    status_map = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "INFEASIBLE",
        cp_model.UNKNOWN: "TIME_LIMIT",
    }
    out_status = status_map.get(status, "TIME_LIMIT")
    # OR-Tools может вернуть UNKNOWN при таймауте с найденным решением — проверим Objective
    # Для MVP считаем UNKNOWN без решения = TIME_LIMIT, с решением = FEASIBLE

    if out_status in ("OPTIMAL", "FEASIBLE"):
        slots = []
        for inst in instances:
            for d in range(input_model.time_grid.days):
                for p in range(input_model.time_grid.periods_per_day):
                    key = (inst["idx"], d, p)
                    if key not in x:
                        continue
                    if solver.Value(x[key]) == 1:
                        room_id = None
                        for rid in room_by_id:
                            yk = (inst["idx"], rid)
                            if yk in y and solver.Value(y[yk]) == 1:
                                room_id = rid
                                break
                        if room_id is None:
                            room_id = next(iter(room_by_id), "unknown")
                        slots.append({
                            "class_id": inst["class_id"],
                            "subject_id": inst["subject_id"],
                            "teacher_id": inst["teacher_id"],
                            "room_id": room_id,
                            "subgroup_label": inst["subgroup_label"] if inst["subgroup_label"] != "" else None,
                            "day": d,
                            "period": p,
                            "joint_lesson_id": inst.get("joint_lesson_id"),
                        })
                        break
        # собрать реальные штрафы
        pen_vals = {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0}
        total = 0
        for name, var in penalties.items():
            try:
                v = int(solver.Value(var))
            except Exception:
                v = 0
            # map internal names: soft.py uses same names as weights
            if name in pen_vals:
                pen_vals[name] = v
                w = getattr(input_model.weights, name, 0)
                total += v * (w if w else 0)
            else:
                pen_vals[name] = v
        pen_vals["total"] = total
        return {
            "schema_version": 1,
            "status": out_status,
            "solver_stats": {
                "wall_ms": wall_ms,
                "branches": int(solver.NumBranches()),
                "conflicts": int(solver.NumConflicts()),
                "gap_percent": 0.0,
                "objective_value": int(solver.ObjectiveValue()) if penalties else 0,
            },
            "penalties": pen_vals,
            "slots": slots,
            "diagnostics": {"infeasible_core": None, "warnings": warnings},
        }
    else:
        core = build_infeasible_core(input_model)
        # если статус INFEASIBLE но эвристика не нашла причину — оставляем generic
        return {
            "schema_version": 2,
            "status": "INFEASIBLE",
            "solver_stats": {"wall_ms": wall_ms, "branches": int(solver.NumBranches()), "conflicts": int(solver.NumConflicts()), "gap_percent": 0.0, "objective_value": 0},
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0, "total": 0},
            "slots": [],
            "diagnostics": {"infeasible_core": core, "warnings": warnings},
        }

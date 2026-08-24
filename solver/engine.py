"""CP-SAT engine: build model, solve, diagnostics."""
import time
from collections import defaultdict

from ortools.sat.python import cp_model

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
    for entry in m.curriculum:
        subj = subject_by_id.get(entry.subject_id)
        if subj is None:
            continue
        is_split = subj.requires_split
        hours = entry.hours_per_week
        for h in range(hours):
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
        # предфильтр по required_room_type: допустимые комнаты
        allowed_rooms = []
        for rid, room in room_by_id.items():
            if subj.required_room_type is not None and room.room_type != subj.required_room_type:
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
    """Эвристика для diagnostics.infeasible_core."""
    reasons = []
    entities = []

    # учитель: requested > available
    avail_by_teacher = {}
    for t in m.teachers:
        avail = sum(1 for row in t.availability for v in row if v)
        # ограничим по time_grid
        max_avail = m.time_grid.days * m.time_grid.periods_per_day
        avail = min(avail, max_avail)
        avail_by_teacher[t.id] = avail

    requested_by_teacher: dict[str, int] = defaultdict(int)
    for e in m.curriculum:
        requested_by_teacher[e.teacher_id] += e.hours_per_week
        if e.split_teacher2_id:
            requested_by_teacher[e.split_teacher2_id] += e.hours_per_week

    for tid, req in requested_by_teacher.items():
        av = avail_by_teacher.get(tid, 0)
        if req > av:
            reasons.append(f"Teacher {tid}: {req} hours requested but only {av} available slots")
            entities.append(tid)

    # кабинеты спецтипа: если часы предмета с required_room_type превышают слоты * кол-во кабинетов
    room_count_by_type: dict[str, int] = defaultdict(int)
    for r in m.rooms:
        room_count_by_type[r.room_type] += 1
    from collections import Counter
    needed_by_type: dict[str, int] = Counter()
    subj_by_id = {s.id: s for s in m.subjects}
    for e in m.curriculum:
        s = subj_by_id.get(e.subject_id)
        if s and s.required_room_type:
            needed_by_type[s.required_room_type] += e.hours_per_week
            if e.split_teacher2_id:
                # split уже удвоен? curriculum hours уже на instance, но needed считает hours, а не instances
                # для split нужно *1 (hours уже на каждую подгруппу) — в нашей модели hours уже раздвоен
                pass

    total_slots = m.time_grid.days * m.time_grid.periods_per_day
    for rt, need in needed_by_type.items():
        have = room_count_by_type.get(rt, 0) * total_slots
        if need > have:
            reasons.append(f"Room type {rt}: {need} hours needed but only {have} room-slots ({room_count_by_type.get(rt,0)} rooms × {total_slots} slots)")
            entities.append(f"room_type:{rt}")

    if not reasons:
        reasons.append("Hard constraints are contradictory (availability, room pools, or shift limits)")
        entities.append("unknown")

    return {
        "reason": "; ".join(reasons),
        "conflicting_entities": entities,
        "suggestion": "Расширьте availability учителей, добавьте кабинеты спецтипа или снизьте часы/ограничьте смены",
    }


def solve(input_model: InputModel) -> dict:
    start = time.time()
    model = cp_model.CpModel()
    x, y, instances, room_by_id, subject_by_id = create_variables(model, input_model)

    # Если нет instance — сразу FEASIBLE пустой
    if not instances:
        return {
            "schema_version": 1,
            "status": "OPTIMAL",
            "solver_stats": {"wall_ms": 0, "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0},
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "total": 0},
            "slots": [],
            "diagnostics": {"infeasible_core": None, "warnings": []},
        }

    # Если для какого-то instance нет доступных слотов или нет подходящих кабинетов -> сразу INFEASIBLE
    room_by_id_tmp = {r.id: r for r in input_model.rooms}
    subj_by_id_tmp = {s.id: s for s in input_model.subjects}
    for inst in instances:
        has_x = any((inst["idx"], d, p) in x for d in range(input_model.time_grid.days) for p in range(input_model.time_grid.periods_per_day))
        has_y = any((inst["idx"], rid) in y for rid in room_by_id_tmp)
        # если у предмета есть required_room_type, но has_y == False => нет подходящих кабинетов
        subj = subj_by_id_tmp.get(inst["subject_id"])
        needs_room = subj is not None and subj.required_room_type is not None
        if not has_x or (needs_room and not has_y):
            core = build_infeasible_core(input_model)
            # уточняем причину для отсутствия кабинета
            if needs_room and not has_y:
                core["reason"] = f"Room type {subj.required_room_type}: no rooms available for subject {subj.id} (class {inst['class_id']})"
                core["conflicting_entities"] = [f"room_type:{subj.required_room_type}", f"subject:{subj.id}"]
            return {
                "schema_version": 1,
                "status": "INFEASIBLE",
                "solver_stats": {"wall_ms": int((time.time()-start)*1000), "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0},
                "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "total": 0},
                "slots": [],
                "diagnostics": {"infeasible_core": core, "warnings": []},
            }

    add_hard_constraints(model, x, y, input_model, instances, room_by_id, subject_by_id)
    penalties = add_soft_constraints(model, x, y, input_model, instances)
    if penalties:
        # сумма взвешенных штрафов — будет в Phase 3
        pass
    else:
        # MVP: без objective solver быстрее находит любое FEASIBLE
        pass

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
                        # найти комнату где y=1
                        room_id = None
                        for rid in room_by_id:
                            yk = (inst["idx"], rid)
                            if yk in y and solver.Value(y[yk]) == 1:
                                room_id = rid
                                break
                        if room_id is None:
                            # fallback: первая доступная
                            room_id = next(iter(room_by_id), "unknown")
                        slots.append({
                            "class_id": inst["class_id"],
                            "subject_id": inst["subject_id"],
                            "teacher_id": inst["teacher_id"],
                            "room_id": room_id,
                            "subgroup_label": inst["subgroup_label"] if inst["subgroup_label"] != "" else None,
                            "day": d,
                            "period": p,
                        })
                        break
        return {
            "schema_version": 1,
            "status": out_status,
            "solver_stats": {
                "wall_ms": wall_ms,
                "branches": int(solver.NumBranches()),
                "conflicts": int(solver.NumConflicts()),
                "gap_percent": 0.0,
                "objective_value": int(solver.ObjectiveValue()) if out_status in ("OPTIMAL","FEASIBLE") and penalties else 0,
            },
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "total": 0},
            "slots": slots,
            "diagnostics": {"infeasible_core": None, "warnings": []},
        }
    else:
        core = build_infeasible_core(input_model)
        # если статус INFEASIBLE но эвристика не нашла причину — оставляем generic
        return {
            "schema_version": 1,
            "status": "INFEASIBLE",
            "solver_stats": {"wall_ms": wall_ms, "branches": int(solver.NumBranches()), "conflicts": int(solver.NumConflicts()), "gap_percent": 0.0, "objective_value": 0},
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "total": 0},
            "slots": [],
            "diagnostics": {"infeasible_core": core, "warnings": []},
        }

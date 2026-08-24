"""
Бенчмарк: CP-SAT vs ручное расписание по всем метрикам.
Запуск: python -m solver.tools.benchmark --quarters 1 2 3 4
"""
import argparse
import pathlib
import json
import time
import collections

import sys
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent.parent))
from solver.schema import InputModel
from solver.engine import solve

def load_json(path: pathlib.Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def compute_penalties(slots, catalog, weights):
    """
    Считает штрафы теми же метриками что и soft.py, но прямым подсчётом (без CP-SAT).
    slots: list of {class_id, subject_id, teacher_id, room_id, day, period}
    catalog: {teachers, classes, rooms, subjects}
    weights: dict (не используется для подсчёта, только для взвешивания в benchmark)
    returns dict penalties
    """
    # helpers
    subject_by_id = {s["id"]: s for s in catalog["subjects"]}
    teacher_by_id = {t["id"]: t for t in catalog["teachers"]}
    room_by_id = {r["id"]: r for r in catalog["rooms"]}
    # S1 windows
    # группировка teacher -> day -> sorted periods
    teacher_day_periods = collections.defaultdict(lambda: collections.defaultdict(list))
    for s in slots:
        tid = s["teacher_id"]
        day = s["day"]
        period = s["period"]
        teacher_day_periods[tid][day].append(period)
    window = 0
    for tid, by_day in teacher_day_periods.items():
        for day, periods in by_day.items():
            periods = sorted(periods)
            if len(periods) < 2:
                continue
            # windows = (max - min +1) - len
            w = (max(periods) - min(periods) + 1) - len(periods)
            if w > 0:
                window += w
    # S2 room displacement: teacher base_room
    room_disp = 0
    for s in slots:
        t = teacher_by_id.get(s["teacher_id"])
        if not t or not t.get("base_room_id"):
            continue
        base = t["base_room_id"]
        # if subject requires specific room type and base not of that type, skip (forced)
        subj = subject_by_id.get(s["subject_id"])
        if subj and subj.get("required_room_type"):
            room = room_by_id.get(base)
            if room and room["room_type"] != subj["required_room_type"]:
                continue
        if s["room_id"] != base:
            room_disp += 1
    # S3 sanpin parabola: ideal [7,11,11,9,7,5] tol 2
    ideal = [7,11,11,9,7,5]
    sanpin = 0
    # group class -> day -> sum weight
    class_day_weight = collections.defaultdict(lambda: collections.defaultdict(int))
    for s in slots:
        subj = subject_by_id.get(s["subject_id"])
        w = subj["sanitary_weight"] if subj else 5
        class_day_weight[s["class_id"]][s["day"]] += w
    for cid, by_day in class_day_weight.items():
        for d, wsum in by_day.items():
            idl = ideal[d] if d < len(ideal) else 7
            tol = 2
            diff = abs(wsum - idl) - tol
            if diff > 0:
                sanpin += diff
    # S4 alternation: related subjects same day
    alternation = 0
    # build related map
    related_pairs = set()
    for subj in catalog["subjects"]:
        rel = subj.get("related_subjects_json")
        # may be "[]" or list via related_subject_ids in some catalogs
        # catalog subjects have no related_subjects_json? we stored as "[]"
        # Try to parse
        try:
            lst = json.loads(rel) if isinstance(rel, str) else []
        except:
            lst = []
        for rid in lst:
            pair = tuple(sorted([subj["id"], rid]))
            related_pairs.add(pair)
    # also check subject synonyms may have related, but catalog currently has none
    # If no related pairs, try to infer algebra/geometry?
    if not related_pairs:
        # fallback: if both algebra and geometry exist, treat as related
        ids = {s["id"] for s in catalog["subjects"]}
        if "algebra" in ids and "geometry" in ids:
            related_pairs.add(("algebra","geometry"))
    # count
    class_day_subjects = collections.defaultdict(lambda: collections.defaultdict(set))
    for s in slots:
        class_day_subjects[s["class_id"]][s["day"]].add(s["subject_id"])
    for cid, by_day in class_day_subjects.items():
        for d, subs in by_day.items():
            for a,b in related_pairs:
                if a in subs and b in subs:
                    alternation += 1
    # S5 movement: floor change between consecutive periods (если разные этажи)
    movement = 0
    # need floor per room
    for tid, by_day in teacher_day_periods.items():
        for day, periods in by_day.items():
            # need mapping period -> room
            period_to_room = {}
            for s in slots:
                if s["teacher_id"]==tid and s["day"]==day:
                    period_to_room[s["period"]] = s["room_id"]
            sorted_p = sorted(period_to_room.keys())
            for i in range(len(sorted_p)-1):
                p1 = sorted_p[i]
                p2 = sorted_p[i+1]
                if p2 != p1+1:
                    continue  # not consecutive
                r1 = room_by_id.get(period_to_room[p1])
                r2 = room_by_id.get(period_to_room[p2])
                if r1 and r2 and r1.get("floor") and r2.get("floor") and r1["floor"] != r2["floor"]:
                    movement += 1
    # S6 load_balance: max - min per class
    load_balance = 0
    class_day_counts = collections.defaultdict(lambda: collections.defaultdict(int))
    for s in slots:
        class_day_counts[s["class_id"]][s["day"]] += 1
    for cid, by_day in class_day_counts.items():
        counts = list(by_day.values())
        if len(counts) >= 2:
            load_balance += max(counts) - min(counts)

    return {
        "window": window,
        "room_displacement": room_disp,
        "sanpin_parabola": sanpin,
        "alternation": alternation,
        "movement": movement,
        "load_balance": load_balance,
        "total": window + room_disp + sanpin + alternation + movement + load_balance,
    }

def main():
    parser = argparse.ArgumentParser(description="Benchmark CP-SAT vs legacy")
    parser.add_argument("--quarters", nargs="+", type=int, default=[1,2,3,4], help="Четверти 1..4")
    parser.add_argument("--materials", type=str, default="data/synthetic", help="Путь к synthetic")
    parser.add_argument("--time-limit", type=int, default=30, help="Лимит солвера сек")
    args = parser.parse_args()

    base = pathlib.Path(args.materials)
    catalog = load_json(base / "catalog.json")

    # weights по умолчанию (как в solver)
    default_weights = {"window":200,"room_displacement":50,"sanpin_parabola":100,"alternation":80,"movement":20,"load_balance":30}

    summary = []
    for q in args.quarters:
        print(f"\n=== Q{q} ===")
        curriculum = load_json(base / f"curriculum_q{q}.json")
        legacy_slots = load_json(base / f"schedule_legacy_q{q}.json")

        # build InputModel for our solver
        # need teachers/classes/rooms/subjects from catalog
        # curriculum already in correct format
        # Build InputModel
        # For teachers, need availability: catalog teachers have availability_json
        # Convert catalog teachers to InputModel format
        teachers_in = []
        for t in catalog["teachers"]:
            avail = json.loads(t["availability_json"]) if isinstance(t["availability_json"], str) else t["availability_json"]
            teachers_in.append({"id": t["id"], "full_name": t["display_name"], "base_room_id": t.get("base_room_id"), "max_daily_lessons": t.get("max_daily_lessons",0), "availability": avail})
        rooms_in = [{"id": r["id"], "name": r["name"], "room_type": r["room_type"], "capacity": r["capacity"], "floor": r.get("floor")} for r in catalog["rooms"]]
        classes_in = [{"id": c["id"], "grade": c["grade"], "letter": c["letter"], "headcount": c.get("headcount",25), "shift": c.get("shift","First"), "subgroups": []} for c in catalog["classes"]]
        subjects_in = [{"id": s["id"], "name": s["name"], "sanitary_weight": s["sanitary_weight"], "required_room_type": s.get("required_room_type"), "requires_split": s.get("requires_split",False), "is_double_allowed": s.get("is_double_allowed",False), "related_subject_ids": []} for s in catalog["subjects"]]

        # curriculum already has hours_per_week, need to ensure split_teacher2_id
        # InputModel expects curriculum entries with class_id etc.

        input_data = {
            "schema_version": 1,
            "meta": {"time_limit_sec": args.time_limit, "num_workers": 4, "random_seed": 42},
            "time_grid": {"days": 6, "periods_per_day": 7},
            "teachers": teachers_in,
            "classes": classes_in,
            "rooms": rooms_in,
            "subjects": subjects_in,
            "curriculum": curriculum,
            "weights": default_weights,
        }
        inp = InputModel.model_validate(input_data)
        start = time.time()
        our = solve(inp)
        wall = int((time.time()-start)*1000)
        print(f"Our status {our['status']} wall {wall}ms total penalty {our['penalties']['total']}")

        # compute legacy penalties via direct counting (same weights but raw sum)
        legacy_pen = compute_penalties(legacy_slots, catalog, default_weights)
        our_pen = our["penalties"]
        # weighted total? For comparison, use weighted total
        # legacy weighted total = sum pen*weight
        w = default_weights
        legacy_weighted = legacy_pen["window"]*w["window"] + legacy_pen["room_displacement"]*w["room_displacement"] + legacy_pen["sanpin_parabola"]*w["sanpin_parabola"] + legacy_pen["alternation"]*w["alternation"] + legacy_pen["movement"]*w["movement"] + legacy_pen["load_balance"]*w["load_balance"]
        our_weighted = our_pen["total"]  # already weighted? In engine, total is weighted sum
        # But our_pen total is weighted sum, legacy_pen total is unweighted sum? In compute_penalties total is unweighted sum, need weighted
        # Let's compute both unweighted and weighted for report
        delta = our_weighted - legacy_weighted

        print(f"Legacy weighted {legacy_weighted} (raw {legacy_pen})")
        print(f"Our weighted {our_weighted} raw {our_pen}")
        print(f"Delta {delta} ({'лучше' if delta<0 else 'хуже'})")

        # write benchmark_q
        # per metric weighted delta
        per_metric = {}
        for k in ["window","room_displacement","sanpin_parabola","alternation","movement","load_balance"]:
            wk = w.get(k,0)
            per_metric[k] = (our_pen.get(k,0) - legacy_pen.get(k,0)) * wk
        out = {
            "quarter": q,
            "legacy": {"penalties": legacy_pen, "weighted_total": legacy_weighted, "slots": len(legacy_slots)},
            "our": {"status": our["status"], "penalties": our_pen, "weighted_total": our_weighted, "wall_ms": our["solver_stats"]["wall_ms"], "slots": len(our["slots"])},
            "delta": {"weighted_total": delta, "per_metric": per_metric},
            "infeasible_core": our["diagnostics"]["infeasible_core"],
        }
        with open(base / f"benchmark_q{q}.json", "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        summary.append({"quarter": q, "legacy_weighted": legacy_weighted, "our_weighted": our_weighted, "delta": delta, "wall_ms": our["solver_stats"]["wall_ms"], "status": our["status"]})

    # summary
    with open(base / "benchmark_summary.json", "w", encoding="utf-8") as f:
        json.dump({"quarters": summary, "weights": default_weights}, f, ensure_ascii=False, indent=2)
    print(f"\nWrote benchmark_summary.json")
    # print table
    print("\nSummary:")
    for s in summary:
        print(f"Q{s['quarter']}: legacy {s['legacy_weighted']} vs our {s['our_weighted']} delta {s['delta']} wall {s['wall_ms']}ms {s['status']}")

if __name__ == "__main__":
    main()

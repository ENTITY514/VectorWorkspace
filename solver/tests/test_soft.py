import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from schema import InputModel
from engine import solve


def make_input(**overrides):
    base = {
        "schema_version": 1,
        "meta": {"time_limit_sec": 10, "num_workers": 2, "random_seed": 42},
        "time_grid": {"days": 6, "periods_per_day": 7},
        "teachers": [],
        "classes": [],
        "rooms": [],
        "subjects": [],
        "curriculum": [],
        "weights": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0},
    }
    base.update(overrides)
    return InputModel.model_validate(base)

def avail_all():
    return [[True]*8 for _ in range(6)]

def count_windows(slots, teacher_id, day):
    # compute windows from slots: sort periods, count gaps
    periods = sorted([s["period"] for s in slots if s["teacher_id"]==teacher_id and s["day"]==day])
    if len(periods) < 2:
        return 0
    return (max(periods) - min(periods) + 1) - len(periods)

def test_soft_windows_minimized():
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Kab1", "room_type": "General", "capacity": 30}],
        subjects=[
            {"id": "math", "name": "Math", "sanitary_weight": 5},
            {"id": "pe", "name": "PE", "sanitary_weight": 5},
            {"id": "eng", "name": "Eng", "sanitary_weight": 5},
        ],
        curriculum=[
            {"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "c1", "subject_id": "pe", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "c1", "subject_id": "eng", "teacher_id": "t1", "hours_per_week": 1},
        ],
        weights={"window": 1000, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0},
        time_grid={"days": 1, "periods_per_day": 5},
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    # with high window weight, teacher should have 0 windows (lessons consecutive) if possible
    assert count_windows(out["slots"], "t1", 0) == 0, f"windows not minimized: {out['slots']} penalties {out['penalties']}"

def test_soft_windows_weight_zero_disables():
    base_kwargs = dict(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Kab1", "room_type": "General", "capacity": 30}],
        subjects=[{"id": "math", "name": "Math", "sanitary_weight": 5}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
        time_grid={"days": 1, "periods_per_day": 5},
    )
    inp0 = make_input(**base_kwargs, weights={"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0})
    out0 = solve(inp0)
    assert out0["penalties"]["window"] == 0
    inp1 = make_input(**base_kwargs, weights={"window": 500, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0})
    out1 = solve(inp1)
    # both feasible, window penalty with weight 0 should be 0
    assert out0["penalties"]["window"] == 0

def test_soft_sanpin_weight_zero():
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Kab1", "room_type": "General", "capacity": 30}],
        subjects=[{"id": "math", "name": "Math", "sanitary_weight": 9}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
        weights={"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0},
    )
    out = solve(inp)
    assert out["penalties"]["sanpin_parabola"] == 0

def test_soft_alternation():
    inp = make_input(
        teachers=[
            {"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()},
            {"id": "t2", "full_name": "T2", "max_daily_lessons": 0, "availability": avail_all()},
        ],
        classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[
            {"id": "r1", "name": "Kab1", "room_type": "General", "capacity": 30},
            {"id": "r2", "name": "Kab2", "room_type": "General", "capacity": 30},
        ],
        subjects=[
            {"id": "algebra", "name": "Algebra", "sanitary_weight": 9, "related_subject_ids": ["geometry"]},
            {"id": "geometry", "name": "Geometry", "sanitary_weight": 9, "related_subject_ids": ["algebra"]},
        ],
        curriculum=[
            {"class_id": "c1", "subject_id": "algebra", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "c1", "subject_id": "geometry", "teacher_id": "t2", "hours_per_week": 1},
        ],
        weights={"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 1000, "movement": 0, "load_balance": 0},
        time_grid={"days": 2, "periods_per_day": 5},
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    # check not same day
    from collections import defaultdict
    by_day = defaultdict(set)
    for s in out["slots"]:
        if s["class_id"] == "c1":
            by_day[s["day"]].add(s["subject_id"])
    for d, subs in by_day.items():
        assert not ("algebra" in subs and "geometry" in subs), f"alternation violated on day {d}: {subs}"

def test_soft_room_displacement():
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[
            {"id": "r_base", "name": "Base", "room_type": "General", "capacity": 30},
            {"id": "r_other", "name": "Other", "room_type": "General", "capacity": 30},
        ],
        subjects=[{"id": "math", "name": "Math", "sanitary_weight": 5}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
        weights={"window": 0, "room_displacement": 1000, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0},
    )
    # set base_room for teacher via curriculum? Actually base_room is on teacher, not via DB; we simulate via teacher base_room_id field
    # Our make_input sets teacher base_room_id? We didn't set; need to update teacher object
    # For this test, we need teacher with base_room_id, so adjust
    inp2 = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all(), "base_room_id": "r_base"}],
        classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[
            {"id": "r_base", "name": "Base", "room_type": "General", "capacity": 30},
            {"id": "r_other", "name": "Other", "room_type": "General", "capacity": 30},
        ],
        subjects=[{"id": "math", "name": "Math", "sanitary_weight": 5}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
        weights={"window": 0, "room_displacement": 1000, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0},
    )
    out = solve(inp2)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    # should be in base room if free
    for s in out["slots"]:
        if s["teacher_id"] == "t1":
            assert s["room_id"] == "r_base", f"should be base room, got {s['room_id']} penalties {out['penalties']}"

def test_soft_weight_zero_disables_all():
    for key in ["window", "room_displacement", "sanpin_parabola", "alternation", "movement", "load_balance"]:
        weights = {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0}
        weights[key] = 0
        inp = make_input(
            teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
            classes=[{"id": "c1", "grade": 8, "letter": "A", "headcount": 25, "shift": "First", "subgroups": []}],
            rooms=[{"id": "r1", "name": "Kab1", "room_type": "General", "capacity": 30}],
            subjects=[{"id": "math", "name": "Math", "sanitary_weight": 5}],
            curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
            weights=weights,
        )
        out = solve(inp)
        assert out["penalties"][key] == 0, f"weight 0 should give penalty 0 for {key}"

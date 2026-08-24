import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from schema import InputModel
from engine import solve


def make_input(**overrides):
    base = {
        "schema_version": 1,
        "meta": {"time_limit_sec": 10, "num_workers": 4, "random_seed": 42},
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

def avail_none():
    return [[False]*8 for _ in range(6)]

def test_hard_teacher_singularity():
    # один учитель, два класса, один слот -> infeasible
    inp = make_input(
        time_grid={"days": 1, "periods_per_day": 1},
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 2, "availability": avail_all()}],
        classes=[
            {"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []},
            {"id": "c2", "grade": 8, "letter": "Б", "headcount": 25, "shift": "First", "subgroups": []},
        ],
        rooms=[
            {"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 30},
            {"id": "r2", "name": "Каб.2", "room_type": "General", "capacity": 30},
        ],
        subjects=[{"id": "math", "name": "Матем", "sanitary_weight": 9}],
        curriculum=[
            {"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "c2", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1},
        ],
    )
    out = solve(inp)
    assert out["status"] == "INFEASIBLE", out

def test_hard_availability_respected():
    # учитель доступен только вторник
    avail = [[False]*8 for _ in range(6)]
    avail[1] = [True]*8
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail}],
        classes=[{"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 30}],
        subjects=[{"id": "math", "name": "Матем", "sanitary_weight": 9}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    for s in out["slots"]:
        assert s["day"] == 1, f"expected tuesday, got day {s['day']}"

def test_hard_required_room_type():
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[
            {"id": "r_gen", "name": "Каб.1", "room_type": "General", "capacity": 30},
            {"id": "r_chem", "name": "Химия", "room_type": "ChemistryLab", "capacity": 30},
        ],
        subjects=[{"id": "chem", "name": "Химия", "sanitary_weight": 9, "required_room_type": "ChemistryLab"}],
        curriculum=[{"class_id": "c1", "subject_id": "chem", "teacher_id": "t1", "hours_per_week": 1}],
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    for s in out["slots"]:
        if s["subject_id"] == "chem":
            assert s["room_id"] == "r_chem", f"chem should be in chem lab, got {s['room_id']}"

def test_hard_room_type_no_room_infeasible():
    # нет химикабинетов -> infeasible (no y variable)
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[
            {"id": "r_gen", "name": "Каб.1", "room_type": "General", "capacity": 30},
        ],
        subjects=[{"id": "chem", "name": "Химия", "sanitary_weight": 9, "required_room_type": "ChemistryLab"}],
        curriculum=[{"class_id": "c1", "subject_id": "chem", "teacher_id": "t1", "hours_per_week": 1}],
    )
    out = solve(inp)
    assert out["status"] == "INFEASIBLE", out

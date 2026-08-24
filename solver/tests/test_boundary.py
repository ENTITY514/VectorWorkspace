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

def test_boundary_infeasible_too_many_lessons():
    inp = make_input(
        time_grid={"days": 1, "periods_per_day": 1},
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 2, "availability": avail_all()}],
        classes=[{"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 30}],
        subjects=[{"id": "math", "name": "Матем", "sanitary_weight": 9}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 2}],
    )
    out = solve(inp)
    assert out["status"] == "INFEASIBLE"
    assert out["diagnostics"]["infeasible_core"] is not None
    assert "infeasible_core" in out["diagnostics"]

def test_boundary_infeasible_chemistry_rooms():
    inp = make_input(
        time_grid={"days": 1, "periods_per_day": 1},
        teachers=[
            {"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail_all()},
            {"id": "t2", "full_name": "T2", "max_daily_lessons": 0, "availability": avail_all()},
            {"id": "t3", "full_name": "T3", "max_daily_lessons": 0, "availability": avail_all()},
        ],
        classes=[
            {"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []},
            {"id": "c2", "grade": 8, "letter": "Б", "headcount": 25, "shift": "First", "subgroups": []},
            {"id": "c3", "grade": 8, "letter": "В", "headcount": 25, "shift": "First", "subgroups": []},
        ],
        rooms=[{"id": "r_chem1", "name": "Химия", "room_type": "ChemistryLab", "capacity": 30}],
        subjects=[{"id": "chem", "name": "Химия", "sanitary_weight": 9, "required_room_type": "ChemistryLab"}],
        curriculum=[
            {"class_id": "c1", "subject_id": "chem", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "c2", "subject_id": "chem", "teacher_id": "t2", "hours_per_week": 1},
            {"class_id": "c3", "subject_id": "chem", "teacher_id": "t3", "hours_per_week": 1},
        ],
    )
    out = solve(inp)
    assert out["status"] == "INFEASIBLE"

def test_boundary_availability_zero():
    avail = [[False]*8 for _ in range(6)]
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail}],
        classes=[{"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 30}],
        subjects=[{"id": "math", "name": "Матем", "sanitary_weight": 9}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
    )
    out = solve(inp)
    assert out["status"] == "INFEASIBLE"
    assert "t1" in out["diagnostics"]["infeasible_core"]["reason"] or "t1" in str(out["diagnostics"]["infeasible_core"]["conflicting_entities"])

def test_infeasible_does_not_crash():
    avail = [[False]*8 for _ in range(6)]
    inp = make_input(
        teachers=[{"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": avail}],
        classes=[{"id": "c1", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[{"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 30}],
        subjects=[{"id": "math", "name": "Матем", "sanitary_weight": 9}],
        curriculum=[{"class_id": "c1", "subject_id": "math", "teacher_id": "t1", "hours_per_week": 1}],
    )
    out = solve(inp)
    assert out["status"] == "INFEASIBLE"
    assert isinstance(out["diagnostics"]["infeasible_core"]["reason"], str)

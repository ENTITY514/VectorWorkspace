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

def test_sanity_split_parallel():
    inp = make_input(
        teachers=[
            {"id": "petrova", "full_name": "Петрова", "max_daily_lessons": 0, "availability": avail_all()},
            {"id": "sidorova", "full_name": "Сидорова", "max_daily_lessons": 0, "availability": avail_all()},
        ],
        classes=[{"id": "c_8a", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": [{"subject_id": "english", "group_count": 2}]}],
        rooms=[
            {"id": "r_lang1", "name": "Лингв1", "room_type": "LanguageLab", "capacity": 30},
            {"id": "r_lang2", "name": "Лингв2", "room_type": "LanguageLab", "capacity": 30},
        ],
        subjects=[{"id": "english", "name": "Английский", "sanitary_weight": 5, "requires_split": True}],
        curriculum=[{"class_id": "c_8a", "subject_id": "english", "teacher_id": "petrova", "split_teacher2_id": "sidorova", "hours_per_week": 1}],
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    slots = [s for s in out["slots"] if s["subject_id"] == "english"]
    assert len(slots) == 2, f"expected 2 split slots, got {slots}"
    assert slots[0]["day"] == slots[1]["day"] and slots[0]["period"] == slots[1]["period"], f"not parallel: {slots}"
    assert slots[0]["room_id"] != slots[1]["room_id"], f"same room: {slots}"
    assert slots[0]["teacher_id"] != slots[1]["teacher_id"]
    assert slots[0]["subgroup_label"] != slots[1]["subgroup_label"]

def test_split_three_hours_parallel():
    inp = make_input(
        teachers=[
            {"id": "petrova", "full_name": "Петрова", "max_daily_lessons": 0, "availability": avail_all()},
            {"id": "sidorova", "full_name": "Сидорова", "max_daily_lessons": 0, "availability": avail_all()},
        ],
        classes=[{"id": "c_8a", "grade": 8, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []}],
        rooms=[
            {"id": "r1", "name": "Каб.1", "room_type": "Informatics", "capacity": 30},
            {"id": "r2", "name": "Каб.2", "room_type": "Informatics", "capacity": 30},
        ],
        subjects=[{"id": "informatics", "name": "Информ", "sanitary_weight": 7, "required_room_type": "Informatics", "requires_split": True}],
        curriculum=[{"class_id": "c_8a", "subject_id": "informatics", "teacher_id": "petrova", "split_teacher2_id": "sidorova", "hours_per_week": 3}],
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    # 3 hours *2 groups =6 slots
    slots = [s for s in out["slots"] if s["subject_id"] == "informatics"]
    assert len(slots) == 6, f"expected 6, got {len(slots)} {slots}"
    # check each hour pair parallel
    from collections import defaultdict
    by_time = defaultdict(list)
    for s in slots:
        by_time[(s["day"], s["period"])].append(s)
    # each time should have exactly 2
    for k, v in by_time.items():
        assert len(v) == 2, f"time {k} should have 2, got {v}"
        assert v[0]["room_id"] != v[1]["room_id"]

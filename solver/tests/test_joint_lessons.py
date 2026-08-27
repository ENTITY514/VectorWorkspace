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


def test_joint_lessons_single_slot():
    """Тест: 1 слот, 1 учитель, 2 класса. Без joint_lesson_id это INFEASIBLE. С joint_lesson_id — FEASIBLE."""
    inp = make_input(
        time_grid={"days": 1, "periods_per_day": 1},
        teachers=[{"id": "t1", "full_name": "Актаева А.Е.", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=[
            {"id": "c6", "grade": 6, "letter": "А", "headcount": 25, "shift": "First", "subgroups": []},
            {"id": "c6luo", "grade": 6, "letter": "ЛУО", "headcount": 10, "shift": "First", "subgroups": []},
        ],
        rooms=[
            {"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 30},
        ],
        subjects=[{"id": "lit", "name": "Литература", "sanitary_weight": 5}],
        curriculum=[
            {"class_id": "c6", "subject_id": "lit", "teacher_id": "t1", "hours_per_week": 1, "joint_lesson_id": "jl_6_6luo"},
            {"class_id": "c6luo", "subject_id": "lit", "teacher_id": "t1", "hours_per_week": 1, "joint_lesson_id": "jl_6_6luo"},
        ],
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    slots = out["slots"]
    assert len(slots) == 2
    assert slots[0]["day"] == slots[1]["day"] == 0
    assert slots[0]["period"] == slots[1]["period"] == 0
    assert slots[0]["joint_lesson_id"] == slots[1]["joint_lesson_id"] == "jl_6_6luo"


def test_joint_lessons_reduces_teacher_load():
    """Тест: Учитель с 40 записями нагрузки, но 15 из них объединены -> укладывается в 5-дневку (35 слотов)."""
    # 5 дней * 7 периодов = 35 слотов
    curriculum = []
    # 20 обычных уроков
    for i in range(20):
        curriculum.append({
            "class_id": f"c_norm_{i}",
            "subject_id": "subj1",
            "teacher_id": "t1",
            "hours_per_week": 1,
            "joint_lesson_id": None
        })
    # 10 пар совмещенных уроков (10 x 2 = 20 записей, но 10 физических слотов)
    for i in range(10):
        jid = f"jl_pair_{i}"
        curriculum.append({
            "class_id": f"c_a_{i}",
            "subject_id": "subj1",
            "teacher_id": "t1",
            "hours_per_week": 1,
            "joint_lesson_id": jid
        })
        curriculum.append({
            "class_id": f"c_b_{i}",
            "subject_id": "subj1",
            "teacher_id": "t1",
            "hours_per_week": 1,
            "joint_lesson_id": jid
        })

    # Итого записей в curriculum = 40. Но физических слотов учителя = 20 + 10 = 30 слотов. 30 <= 35 -> должно уложиться!
    classes = []
    for i in range(20):
        classes.append({"id": f"c_norm_{i}", "grade": 5, "letter": f"{i}", "headcount": 20, "shift": "First", "subgroups": []})
    for i in range(10):
        classes.append({"id": f"c_a_{i}", "grade": 6, "letter": f"A{i}", "headcount": 20, "shift": "First", "subgroups": []})
        classes.append({"id": f"c_b_{i}", "grade": 6, "letter": f"B{i}", "headcount": 20, "shift": "First", "subgroups": []})

    inp = make_input(
        time_grid={"days": 5, "periods_per_day": 7},
        teachers=[{"id": "t1", "full_name": "Актаева А.Е.", "max_daily_lessons": 0, "availability": avail_all()}],
        classes=classes,
        rooms=[{"id": "r1", "name": "Каб.1", "room_type": "General", "capacity": 50}],
        subjects=[{"id": "subj1", "name": "Предмет1", "sanitary_weight": 5}],
        curriculum=curriculum,
    )
    out = solve(inp)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert len(out["slots"]) == 40

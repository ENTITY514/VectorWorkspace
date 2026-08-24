import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from schema import InputModel
from engine import solve

def avail_all():
    return [[True]*8 for _ in range(6)]

def make_school(num_classes, num_teachers, num_rooms, periods=6, days=5):
    teachers = [{"id": f"t{i}", "full_name": f"T{i}", "max_daily_lessons": 0, "availability": avail_all()} for i in range(num_teachers)]
    rooms = [{"id": f"r{i}", "name": f"Kab{i}", "room_type": "General", "capacity": 30} for i in range(num_rooms)]
    classes = [{"id": f"c{i}", "grade": 8, "letter": chr(65+i%10), "headcount": 25, "shift": "First", "subgroups": []} for i in range(num_classes)]
    subjects = [
        {"id": "math", "name": "Math", "sanitary_weight": 9},
        {"id": "pe", "name": "PE", "sanitary_weight": 2},
        {"id": "eng", "name": "Eng", "sanitary_weight": 5, "requires_split": False},
    ]
    curriculum = []
    for c in classes:
        # each class 4 hours: 2 math,1 pe,1 eng
        curriculum.append({"class_id": c["id"], "subject_id": "math", "teacher_id": f"t{int(c['id'][1:]) % num_teachers}", "hours_per_week": 2})
        curriculum.append({"class_id": c["id"], "subject_id": "pe", "teacher_id": f"t{(int(c['id'][1:])+1) % num_teachers}", "hours_per_week": 1})
        curriculum.append({"class_id": c["id"], "subject_id": "eng", "teacher_id": f"t{(int(c['id'][1:])+2) % num_teachers}", "hours_per_week": 1})
    base = {
        "schema_version": 1,
        "meta": {"time_limit_sec": 30, "num_workers": 4, "random_seed": 42},
        "time_grid": {"days": days, "periods_per_day": periods},
        "teachers": teachers,
        "classes": classes,
        "rooms": rooms,
        "subjects": subjects,
        "curriculum": curriculum,
        "weights": {"window": 50, "room_displacement": 10, "sanpin_parabola": 20, "alternation": 10, "movement": 0, "load_balance": 10},
    }
    return InputModel.model_validate(base)

@pytest.mark.slow
def test_load_micro():
    inp = make_school(1, 3, 3, periods=3, days=2)
    start = time.time()
    out = solve(inp)
    elapsed = time.time() - start
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert elapsed < 1.0, f"micro took {elapsed}s"

@pytest.mark.slow
def test_load_small():
    inp = make_school(10, 15, 10, periods=6, days=5)
    # для измерения скорости — отключаем тяжёлые soft (оставляем 0) чтобы не маскировать Hard-производительность
    inp.weights.window = 0
    inp.weights.sanpin_parabola = 0
    inp.weights.alternation = 0
    inp.weights.load_balance = 0
    start = time.time()
    out = solve(inp)
    elapsed = time.time() - start
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert elapsed < 15.0, f"small took {elapsed}s"

def test_load_typical_metrics():
    # typical without slow marker, but we check instance count
    inp = make_school(30, 40, 35, periods=7, days=6)
    # не решаем полностью (тяжело в CI), просто проверяем что модель строится без паники и число instance ~ 30*4=120
    from engine import create_variables
    from ortools.sat.python import cp_model
    model = cp_model.CpModel()
    x, y, instances, _, _ = create_variables(model, inp)
    # 30 classes * (2+1+1)=4 hours each =120 instances, each 42 slots => ~5040 x vars
    assert len(instances) == 120, f"expected 120, got {len(instances)}"
    assert len(x) > 0

import sys, json, sqlite3, os
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).parent.parent
sys.path.insert(0, str(root))

appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Update schedule_curriculum joint_lesson_id for Babich 7b and 9
cur.execute("UPDATE schedule_curriculum SET joint_lesson_id='jl_babich_7b_math' WHERE teacher_id LIKE '%бабич%' AND class_id IN ('7б', '7б_luo')")
cur.execute("UPDATE schedule_curriculum SET joint_lesson_id='jl_babich_9_math' WHERE teacher_id LIKE '%бабич%' AND class_id IN ('9', '9_luo')")

# Also check other teachers who have math/algebra/geometry in luo
cur.execute("UPDATE schedule_curriculum SET joint_lesson_id='jl_radio_3_math' WHERE teacher_id LIKE '%радионова%' AND class_id IN ('3_luo', '3а', '3б') AND subject_id LIKE '%math%'")
cur.execute("UPDATE schedule_curriculum SET joint_lesson_id='jl_pashch_5_math' WHERE teacher_id LIKE '%пащенко%' AND class_id IN ('5_luo', '5а', '5б') AND subject_id LIKE '%math%'")
cur.execute("UPDATE schedule_curriculum SET joint_lesson_id='jl_bedrina_6_math' WHERE teacher_id LIKE '%бедрина%' AND class_id IN ('6_luo', '6') AND subject_id LIKE '%math%'")

conn.commit()
conn.close()
print("Updated joint_lesson_ids in DB schedule_curriculum!")

# 2. Run Python solver engine to re-generate V3 with math group daily limit
from solver.engine import solve
from solver.schema import InputModel

# Fetch current catalog state from DB or solver input format
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Export solver state from DB
cur.execute("SELECT id, name, sanitary_weight, requires_split FROM schedule_subjects")
subjects = [{"id": r[0], "name": r[1], "sanitary_weight": r[2], "requires_split": bool(r[3])} for r in cur.fetchall()]

cur.execute("SELECT id, grade, letter, headcount, shift, class_type FROM schedule_classes")
classes = [{"id": r[0], "grade": r[1], "letter": r[2], "headcount": r[3], "shift": r[4], "class_type": r[5]} for r in cur.fetchall()]

cur.execute("SELECT id, full_name, max_daily_lessons, availability_json FROM schedule_teachers")
teachers = [{"id": r[0], "full_name": r[1], "max_daily_lessons": r[2], "availability": json.loads(r[3])} for r in cur.fetchall()]

cur.execute("SELECT id, name, room_type, capacity FROM schedule_rooms")
rooms = [{"id": r[0], "name": r[1], "room_type": r[2], "capacity": r[3]} for r in cur.fetchall()]

cur.execute("SELECT id, class_id, subject_id, teacher_id, hours_per_week, joint_lesson_id FROM schedule_curriculum")
curriculum = [{
    "id": r[0], "class_id": r[1], "subject_id": r[2], "teacher_id": r[3],
    "hours_per_week": r[4], "room_type": None, "joint_lesson_id": r[5]
} for r in cur.fetchall()]

cur.execute("SELECT class_id, day, period, variant_id FROM schedule_fixed_slots")
fixed_slots = [{"class_id": r[0], "day": r[1], "period": r[2], "variant_id": r[3]} for r in cur.fetchall()]

conn.close()

solver_input_data = {
    "subjects": subjects,
    "classes": classes,
    "teachers": teachers,
    "rooms": rooms,
    "curriculum": curriculum,
    "fixed_slots": fixed_slots,
    "time_grid": {
        "days": 5,
        "periods_per_day": 7
    },
    "weights": {
        "window": 10,
        "room_displacement": 5,
        "sanpin_parabola": 5,
        "alternation": 5,
        "movement": 3,
        "load_balance": 3,
        "change_slot": 2
    },
    "config": {
        "max_periods_per_day": 7,
        "working_days": [0, 1, 2, 3, 4],
        "variant_id": "v3_cpsat",
        "time_limit_seconds": 15
    }
}

solver_input = InputModel.model_validate(solver_input_data)
result = solve(solver_input)

print(f"Solver Status: {result['status']}")
print(f"Diagnostics: {result.get('diagnostics')}")
print(f"Total slots solved: {len(result['slots'])}")

if result['status'] in ('FEASIBLE', 'OPTIMAL'):
    print("\n--- 7-а SLOTS IN V3 (CP-SAT) ---")
    for s in sorted(result['slots'], key=lambda x: (x['day'], x['period'])):
        if s['class_id'] == '7а':
            print(f"  Day {s['day']}, Period {s['period']+1}: {s['subject_id']} (Teacher: {s['teacher_id']})")

    print("\n--- 7-б & 7-б ЛУО SLOTS IN V3 (CP-SAT) ---")
    for s in sorted(result['slots'], key=lambda x: (x['day'], x['period'])):
        if s['class_id'] in ('7б', '7б_luo') and ('algebra' in s['subject_id'] or 'geometry' in s['subject_id'] or 'math' in s['subject_id']):
            print(f"  Day {s['day']}, Period {s['period']+1}: class={s['class_id']}, subj={s['subject_id']}, joint={s.get('joint_lesson_id')}")

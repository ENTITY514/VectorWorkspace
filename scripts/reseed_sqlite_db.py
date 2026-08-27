import sqlite3, json, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

root = Path(__file__).parent.parent
v1_path = root / "data" / "synthetic" / "schedule_q4_2026_variant1.json"
v2_path = root / "data" / "synthetic" / "schedule_q4_2026_variant2.json"
v3_path = root / "data" / "synthetic" / "schedule_q4_2026_variant3.json"
curr_path = root / "data" / "synthetic" / "curriculum_q4_2026_variant.json"
catalog_path = root / "data" / "synthetic" / "catalog.json"

appdata = os.getenv('APPDATA')
possible_db_paths = [
    Path(appdata) / "vector-workspace-desktop" / "vector.db",
    Path(appdata) / "com.vectorworkspace.desktop" / "vector.db",
    Path(appdata) / "VectorWorkspace" / "vector.db",
]

db_path = None
for p in possible_db_paths:
    if p.exists():
        db_path = p
        break

if not db_path:
    # Look for any vector.db in APPDATA
    for p in Path(appdata).rglob("vector.db"):
        db_path = p
        break

if not db_path:
    print("No vector.db found in APPDATA. Creating at standard path...")
    db_path = Path(appdata) / "vector-workspace-desktop" / "vector.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

print(f"Target SQLite DB: {db_path}")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Ensure migration 0018 columns exist
try:
    cur.execute("ALTER TABLE schedule_curriculum ADD COLUMN joint_lesson_id TEXT")
except Exception:
    pass

try:
    cur.execute("ALTER TABLE schedule_slots ADD COLUMN joint_lesson_id TEXT")
except Exception:
    pass

# Read JSON data
with open(v1_path, "r", encoding="utf-8") as f:
    slots_v1 = json.load(f)

slots_v2 = []
if v2_path.exists():
    with open(v2_path, "r", encoding="utf-8") as f:
        slots_v2 = json.load(f)

slots_v3 = []
if v3_path.exists():
    with open(v3_path, "r", encoding="utf-8") as f:
        slots_v3 = json.load(f)

with open(curr_path, "r", encoding="utf-8") as f:
    curriculum = json.load(f)

# Read catalog data
with open(catalog_path, "r", encoding="utf-8") as f:
    catalog = json.load(f)

# Disable FK during reseed
cur.execute("PRAGMA foreign_keys = OFF;")

# 1. Seed Classes
cur.execute("DELETE FROM schedule_classes")
for c in catalog.get("classes", []):
    ctype = "normal"
    if "luo" in c["id"].lower():
        ctype = "luo"
    elif "do" in c["id"].lower():
        ctype = "do"
    cur.execute(
        "INSERT OR REPLACE INTO schedule_classes (id, grade, letter, headcount, shift, class_type) VALUES (?, ?, ?, ?, ?, ?)",
        (c["id"], c["grade"], c["letter"], c.get("headcount", 25), c.get("shift", "First"), ctype)
    )

# 2. Seed Rooms
cur.execute("DELETE FROM schedule_rooms")
for r in catalog.get("rooms", []):
    cur.execute(
        "INSERT OR REPLACE INTO schedule_rooms (id, name, room_type, capacity, base_teacher_id, floor) VALUES (?, ?, ?, ?, ?, ?)",
        (r["id"], r.get("name", r["id"]), r.get("room_type", "Standard"), r.get("capacity", 30), r.get("base_teacher_id"), r.get("floor", 1))
    )

# Also ensure any room referenced in slots exists in schedule_rooms
all_slot_rooms = set()
for slist in [slots_v1, slots_v2, slots_v3]:
    for s in slist:
        if s.get("room_id"):
            all_slot_rooms.add(s["room_id"])

for rid in all_slot_rooms:
    cur.execute("INSERT OR IGNORE INTO schedule_rooms (id, name, room_type, capacity, floor) VALUES (?, ?, ?, 30, 1)", (rid, rid, "Standard"))

# 3. Seed Subjects
cur.execute("DELETE FROM schedule_subjects")
for s in catalog.get("subjects", []):
    rel = s.get("related_subjects_json")
    rel_str = json.dumps(rel, ensure_ascii=False) if isinstance(rel, list) else (rel or "[]")
    cur.execute(
        "INSERT OR REPLACE INTO schedule_subjects (id, name, sanitary_weight, required_room_type, requires_split, is_double_allowed, related_subjects_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (s["id"], s.get("name", s["id"]), s.get("sanitary_weight", 5), s.get("required_room_type"), 1 if s.get("requires_split") else 0, 1 if s.get("is_double_allowed") else 0, rel_str)
    )

# Also ensure any subject referenced in curriculum/slots exists in schedule_subjects
all_subjs = set()
for c in curriculum:
    if c.get("subject_id"):
        all_subjs.add(c["subject_id"])
for slist in [slots_v1, slots_v2, slots_v3]:
    for s in slist:
        if s.get("subject_id"):
            all_subjs.add(s["subject_id"])

for sid in all_subjs:
    cur.execute("INSERT OR IGNORE INTO schedule_subjects (id, name, sanitary_weight) VALUES (?, ?, 5)", (sid, sid))

# 4. Seed Teachers
cur.execute("DELETE FROM schedule_teachers")
default_avail_str = json.dumps([[True] * 8 for _ in range(6)])
for t in catalog.get("teachers", []):
    avail = t.get("availability")
    if isinstance(avail, list) and len(avail) == 6 and all(len(row) == 8 for row in avail):
        avail_str = json.dumps(avail)
    else:
        avail_str = default_avail_str
    cur.execute(
        "INSERT OR REPLACE INTO schedule_teachers (id, full_name, base_room_id, max_daily_lessons, availability_json) VALUES (?, ?, ?, ?, ?)",
        (t["id"], t.get("full_name", t["id"]), t.get("base_room_id"), t.get("max_daily_lessons", 6), avail_str)
    )

# Also ensure any teacher in curriculum/slots exists in schedule_teachers
all_teachers = set()
for c in curriculum:
    if c.get("teacher_id"):
        all_teachers.add(c["teacher_id"])
for slist in [slots_v1, slots_v2, slots_v3]:
    for s in slist:
        if s.get("teacher_id"):
            all_teachers.add(s["teacher_id"])

for tid in all_teachers:
    cur.execute(
        "INSERT OR IGNORE INTO schedule_teachers (id, full_name, max_daily_lessons, availability_json) VALUES (?, ?, 7, ?)",
        (tid, tid, default_avail_str)
    )

# 5. Update curriculum table
cur.execute("DELETE FROM schedule_curriculum")
for c in curriculum:
    cur.execute(
        "INSERT OR REPLACE INTO schedule_curriculum (id, class_id, subject_id, teacher_id, split_teacher2_id, hours_per_week, joint_lesson_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            f"c_{c['class_id']}_{c['subject_id']}_{c['teacher_id']}",
            c["class_id"],
            c["subject_id"],
            c["teacher_id"],
            c.get("split_teacher2_id"),
            c["hours_per_week"],
            c.get("joint_lesson_id")
        )
    )

# 6. Insert/Update variants V1, V2, V3
variants = [
    ("default", "4 четверть, Вариант 1 (Ручной / XLS)", "2025-2026", 4, 1, 1, None),
    ("v2_q4", "4 четверть, Вариант 2 (Жадный алгоритм)", "2025-2026", 4, 2, 0, "default"),
    ("v3_q4", "4 четверть, Вариант 3 (Умный алгоритм CP-SAT)", "2025-2026", 4, 3, 0, "default")
]

for v in variants:
    cur.execute(
        "INSERT OR REPLACE INTO schedule_variants (id, name, academic_year, quarter_number, variant_number, is_active, created_at, parent_variant_id) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)",
        v
    )

# 7. Populate slots for all 3 variants
cur.execute("DELETE FROM schedule_slots")

def insert_slots(slots, variant_id, prefix):
    for s in slots:
        subgroup = s.get("subgroup_label") or ""
        slot_id = f"{prefix}_{s['class_id']}_{s['day']}_{s['period']}_{s['teacher_id']}"
        if subgroup:
            slot_id += f"_{subgroup}"
        cur.execute(
            """INSERT OR REPLACE INTO schedule_slots 
               (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (
                slot_id,
                s["class_id"],
                s["subject_id"],
                s["teacher_id"],
                s["room_id"],
                subgroup,
                s["day"],
                s["period"],
                variant_id,
                s.get("joint_lesson_id")
            )
        )

insert_slots(slots_v1, "default", "q4v1")
insert_slots(slots_v2 if slots_v2 else slots_v1, "v2_q4", "q4v2")
insert_slots(slots_v3 if slots_v3 else slots_v1, "v3_q4", "q4v3")

cur.execute("PRAGMA foreign_keys = ON;")
fk_check = cur.execute("PRAGMA foreign_key_check;").fetchall()
if fk_check:
    print(f"WARNING: Found {len(fk_check)} foreign key errors during reseed!")
else:
    print("FK Check: PASSED (0 foreign key errors!)")

conn.commit()
conn.close()

print(f"Successfully seeded SQLite DB at {db_path}:")
print(f"  Classes: {len(catalog.get('classes', []))}")
print(f"  Rooms: {len(catalog.get('rooms', []))}")
print(f"  Subjects: {len(catalog.get('subjects', []))}")
print(f"  Teachers: {len(catalog.get('teachers', []))}")
print(f"  Curriculum: {len(curriculum)} entries")
print(f"  Variant 1 (Manual/XLS): {len(slots_v1)} slots")
print(f"  Variant 2 (Greedy): {len(slots_v2)} slots")
print(f"  Variant 3 (CP-SAT): {len(slots_v3)} slots")

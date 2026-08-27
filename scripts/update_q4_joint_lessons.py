import sys, json, os
from collections import defaultdict
from pathlib import Path

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

root = Path(__file__).parent.parent
sys.path.insert(0, str(root))
v1_path = root / "data" / "synthetic" / "schedule_q4_2026_variant1.json"
v2_path = root / "data" / "synthetic" / "schedule_q4_2026_variant2.json"
v3_path = root / "data" / "synthetic" / "schedule_q4_2026_variant3.json"
curr_path = root / "data" / "synthetic" / "curriculum_q4_2026_variant.json"
catalog_path = root / "data" / "synthetic" / "catalog.json"

print("--- 1. LOADING DATA ---")
with open(v1_path, "r", encoding="utf-8") as f:
    slots_v1 = json.load(f)

with open(catalog_path, "r", encoding="utf-8") as f:
    catalog = json.load(f)

# Auto-detect joint slots in Variant 1
print("--- 2. AUTO-DETECTING JOINT LESSONS ---")
slots_by_teacher_time = defaultdict(list)
for s in slots_v1:
    key = (s["teacher_id"], s["day"], s["period"])
    slots_by_teacher_time[key].append(s)

joint_groups_created = 0
joint_curriculum_map = {} # (class_id, subject_id, teacher_id) -> joint_lesson_id

for (teacher_id, day, period), slot_list in slots_by_teacher_time.items():
    if len(slot_list) > 1:
        joint_id = f"jl_{teacher_id}_d{day}_p{period}"
        joint_groups_created += 1
        for s in slot_list:
            s["joint_lesson_id"] = joint_id
            curr_key = (s["class_id"], s["subject_id"], s["teacher_id"])
            joint_curriculum_map[curr_key] = joint_id
    else:
        for s in slot_list:
            if "joint_lesson_id" not in s:
                s["joint_lesson_id"] = None

print(f"Auto-detected {joint_groups_created} joint lesson groups across V1 slots.")

# Save updated Variant 1
with open(v1_path, "w", encoding="utf-8") as f:
    json.dump(slots_v1, f, ensure_ascii=False, indent=2)
print(f"Saved updated {v1_path}")

# Load base 5-day curriculum if available
cur5_path = root / "data" / "synthetic" / "curriculum_q4_5day.json"
if cur5_path.exists():
    with open(cur5_path, "r", encoding="utf-8") as f:
        curriculum = json.load(f)
    print(f"Loaded 5-day curriculum from {cur5_path} ({len(curriculum)} entries)")
else:
    curriculum_map = {}
    for s in slots_v1:
        key = (s["class_id"], s["subject_id"], s["teacher_id"])
        jid = joint_curriculum_map.get(key)
        if key in curriculum_map:
            curriculum_map[key]["hours_per_week"] += 1
        else:
            curriculum_map[key] = {
                "class_id": s["class_id"],
                "subject_id": s["subject_id"],
                "teacher_id": s["teacher_id"],
                "split_teacher2_id": None,
                "hours_per_week": 1,
                "joint_lesson_id": jid
            }
    curriculum = list(curriculum_map.values())

# Apply joint_lesson_id auto-detection to curriculum
for c in curriculum:
    key = (c["class_id"], c["subject_id"], c["teacher_id"])
    if key in joint_curriculum_map:
        c["joint_lesson_id"] = joint_curriculum_map[key]
    elif "joint_lesson_id" not in c:
        c["joint_lesson_id"] = None

# Unify joint_lesson_id for multi-subject joint curriculum groups across LUO/DO & regular classes
multi_subject_joint_rules = [
    # (teacher_id, (class_group), (subject_group), joint_id_name)
    ("бабич_ид", ("7б", "7б_luo"), ("algebra", "geometry", "math"), "jl_бабич_ид_7б_math"),
    ("бабич_ид", ("9", "9_luo"), ("algebra", "geometry", "math"), "jl_бабич_ид_9_math"),
    ("жолдан_аб", ("7б", "7б_luo"), ("russian", "literature", "xls_6bff7fd8e0e9"), "jl_жолдан_аб_7б_rus"),
    ("дмитриев_ев", ("5б", "5_luo"), ("russian", "literature", "xls_6bff7fd8e0e9"), "jl_дмитриев_ев_5_rus"),
    ("дмитриев_ев", ("9", "9_luo"), ("russian", "literature", "xls_6bff7fd8e0e9"), "jl_дмитриев_ев_9_rus"),
    ("досаева_мх", ("7б", "7б_luo"), ("history_kz", "history_world", "history"), "jl_досаева_мх_7б_hist"),
    ("темерканова_ов", ("7б", "7б_luo"), ("literature", "xls_6bff7fd8e0e9"), "jl_темерканова_ов_7б_lit"),
    ("красноперова_ов", ("7б", "7б_luo"), ("biology", "geography", "estestvoznanie", "xls_2e044454979d"), "jl_красноперова_ов_7б_science"),
    ("иващенко_во", ("6", "6_luo"), ("biology", "estestvoznanie", "xls_2e044454979d"), "jl_иващенко_во_6_science"),
    ("ольков_гв", ("3б", "3_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_ольков_гв_3_pe"),
    ("ольков_гв", ("5б", "5_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_ольков_гв_5_pe"),
    ("ольков_гв", ("7б", "7б_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_ольков_гв_7б_pe"),
    ("чифин_дн", ("3б", "3_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_чифин_дн_3_pe"),
    ("шкиря_юн", ("3б", "3_luo"), ("music", "музыкаипение"), "jl_шкиря_юн_3_music"),
    ("шкиря_юн", ("5б", "5_luo"), ("music", "музыкаипение"), "jl_шкиря_юн_5_music"),
    ("шкиря_юн", ("6", "6_luo"), ("music", "музыкаипение"), "jl_шкиря_юн_6_music"),
]

for c in curriculum:
    for tid, c_grp, s_grp, jid in multi_subject_joint_rules:
        if c["teacher_id"] == tid and c["class_id"] in c_grp and c["subject_id"] in s_grp:
            c["joint_lesson_id"] = jid

with open(curr_path, "w", encoding="utf-8") as f:
    json.dump(curriculum, f, ensure_ascii=False, indent=2)
print(f"Saved updated curriculum to {curr_path} ({len(curriculum)} entries)")

# Calculate physical workloads
teacher_raw_hours = defaultdict(int)
teacher_phys_slots = defaultdict(int)
teacher_joint_hrs = defaultdict(dict)

for c in curriculum:
    tid = c["teacher_id"]
    hrs = c["hours_per_week"]
    jid = c["joint_lesson_id"]
    teacher_raw_hours[tid] += hrs
    if jid:
        prev = teacher_joint_hrs[tid].get(jid, 0)
        teacher_joint_hrs[tid][jid] = max(prev, hrs)
    else:
        teacher_phys_slots[tid] += hrs

for tid, jdict in teacher_joint_hrs.items():
    teacher_phys_slots[tid] += sum(jdict.values())

teacher_name_by_id = {t["id"]: t["full_name"] for t in catalog["teachers"]}

print("\n--- TEACHER WORKLOAD SUMMARY AFTER JOINT LESSONS ---")
top_teachers = sorted(teacher_raw_hours.keys(), key=lambda x: teacher_raw_hours[x], reverse=True)[:10]
for tid in top_teachers:
    name = teacher_name_by_id.get(tid, tid)
    raw = teacher_raw_hours[tid]
    phys = teacher_phys_slots[tid]
    print(f"  {name}: {raw} raw hours -> {phys} physical slots/week")

# --- 4. RUN CP-SAT SOLVER FOR VARIANT 3 (5 DAYS x 7 PERIODS) ---
print("\n--- 5. RUNNING CP-SAT SOLVER (VARIANT 3) ---")
from solver.schema import InputModel
from solver.engine import solve

input_dict = {
    "schema_version": 1,
    "meta": {
        "school_name": "Школа Q4 2026",
        "time_limit_sec": 60,
        "num_workers": 8,
        "random_seed": 42
    },
    "time_grid": {
        "days": 5,
        "periods_per_day": 7
    },
    "teachers": [
        {
            "id": t["id"],
            "full_name": t["full_name"],
            "base_room_id": t.get("base_room_id"),
            "max_daily_lessons": t.get("max_daily_lessons", 0),
            "availability": json.loads(t["availability_json"]) if isinstance(t["availability_json"], str) else t["availability_json"],
            "subject_ids": json.loads(t["subject_ids"]) if isinstance(t.get("subject_ids"), str) else t.get("subject_ids", []),
            "is_combined": t.get("is_combined", False)
        }
        for t in catalog["teachers"]
    ],
    "classes": [
        {
            "id": c["id"],
            "grade": c["grade"],
            "letter": c["letter"],
            "headcount": c["headcount"],
            "shift": c["shift"],
            "subgroups": []
        }
        for c in catalog["classes"]
    ],
    "rooms": [
        {
            "id": r["id"],
            "name": r["name"],
            "room_type": r["room_type"],
            "capacity": r["capacity"],
            "floor": r.get("floor")
        }
        for r in catalog["rooms"]
    ],
    "subjects": [
        {
            "id": s["id"],
            "name": s["name"],
            "sanitary_weight": s["sanitary_weight"],
            "required_room_type": s.get("required_room_type"),
            "requires_split": bool(s.get("requires_split")),
            "is_double_allowed": bool(s.get("is_double_allowed")),
            "related_subject_ids": json.loads(s["related_subjects_json"]) if isinstance(s.get("related_subjects_json"), str) else s.get("related_subjects_json", [])
        }
        for s in catalog["subjects"]
    ],
    "curriculum": curriculum,
    "weights": {
        "window": 400,
        "room_displacement": 50,
        "sanpin_parabola": 100,
        "alternation": 80,
        "movement": 20,
        "load_balance": 80,
        "change_slot": 0
    },
    "fixed_lessons": []
}

inp = InputModel.model_validate(input_dict)
print("Solving CP-SAT on 5x7 grid (35 slots) with joint lessons...")
out = solve(inp)

print(f"Status: {out['status']}")
print(f"Wall Time: {out['solver_stats']['wall_ms']} ms")
print(f"Generated Slots: {len(out['slots'])}")
print(f"Penalties: {json.dumps(out['penalties'], indent=2)}")

# Save Variant 3 slots
v3_slots = []
for s in out["slots"]:
    v3_slots.append({
        "class_id": s["class_id"],
        "subject_id": s["subject_id"],
        "teacher_id": s["teacher_id"],
        "room_id": s["room_id"],
        "day": s["day"],
        "period": s["period"],
        "subgroup_label": s.get("subgroup_label") or "",
        "quarter": 4,
        "week": 1,
        "joint_lesson_id": s.get("joint_lesson_id"),
        "variant_id": "v3"
    })

with open(v3_path, "w", encoding="utf-8") as f:
    json.dump(v3_slots, f, ensure_ascii=False, indent=2)
print(f"Saved Variant 3 slots to {v3_path} ({len(v3_slots)} slots)")
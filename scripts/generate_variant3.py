import json, pathlib, sys

root = pathlib.Path(r"C:\Projects\VectorWorkspace")
catalog_path = root / "data" / "synthetic" / "catalog.json"
curriculum_path = root / "data" / "synthetic" / "curriculum_q4_2026_variant.json"
out_path = root / "data" / "synthetic" / "schedule_q4_2026_variant3.json"

catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
# Use 5-day balanced curriculum (651 periods, max teacher 35 fits 5×7=35)
for p in [root / "data" / "synthetic" / "curriculum_q4_5day_balanced.json", root / "data" / "synthetic" / "curriculum_q4_5day.json"]:
    if p.exists():
        curriculum = json.loads(p.read_text(encoding='utf-8'))
        print(f"Using {p.name}: {len(curriculum)} entries, total {sum(c['hours_per_week'] for c in curriculum)}")
        break
else:
    curriculum = json.loads(curriculum_path.read_text(encoding='utf-8'))

# Build InputModel
teachers=[]
for t in catalog['teachers']:
    # availability_json is stringified 6x8 true
    avail = json.loads(t['availability_json'])
    # ensure 6x8
    teachers.append({
        "id": t['id'],
        "full_name": t['full_name'],
        "base_room_id": t['base_room_id'],
        "max_daily_lessons": t['max_daily_lessons'],
        "availability": avail,
        "subject_ids": json.loads(t.get('subject_ids','[]')) if isinstance(t.get('subject_ids'), str) else t.get('subject_ids', []),
        "is_combined": False
    })

classes=[]
for c in catalog['classes']:
    classes.append({
        "id": c['id'],
        "grade": c['grade'],
        "letter": c['letter'],
        "headcount": c['headcount'],
        "shift": c['shift'],
        "subgroups": []
    })

rooms=[]
for r in catalog['rooms']:
    rooms.append({
        "id": r['id'],
        "name": r['name'],
        "room_type": r['room_type'],
        "capacity": r['capacity'],
        "floor": r.get('floor')
    })

subjects=[]
for s in catalog['subjects']:
    subjects.append({
        "id": s['id'],
        "name": s['name'],
        "sanitary_weight": s['sanitary_weight'],
        "required_room_type": s['required_room_type'],
        "requires_split": bool(s.get('requires_split', False)),
        "is_double_allowed": bool(s.get('is_double_allowed', False)),
        "related_subject_ids": json.loads(s.get('related_subjects_json','[]')) if isinstance(s.get('related_subjects_json'), str) else []
    })

# Weights tuned slightly for better soft: increase window and load_balance
weights = {
    "window": 400,
    "room_displacement": 50,
    "sanpin_parabola": 100,
    "alternation": 80,
    "movement": 20,
    "load_balance": 80,
    "change_slot": 0
}

input_model = {
    "schema_version": 2,
    "meta": {
        "school_name": "Vector Q4 2026",
        "generated_at": "2026-08-27T00:00:00Z",
        "time_limit_sec": 180,
        "num_workers": 8,
        "random_seed": 42
    },
    "time_grid": {"days": 5, "periods_per_day": 7},
    "teachers": teachers,
    "classes": classes,
    "rooms": rooms,
    "subjects": subjects,
    "curriculum": curriculum,
    "weights": weights
}

# Write input for debug
pathlib.Path(root/"data"/"q4_2026_variant3_input.json").write_text(json.dumps(input_model, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"Input: {len(teachers)} teachers, {len(classes)} classes, {len(rooms)} rooms, {len(subjects)} subjects, {len(curriculum)} curriculum entries")
print(f"Running solver 180s...")

# Call engine directly
sys.path.insert(0, str(root/"solver"))
from schema import InputModel
from engine import solve
inp = InputModel.model_validate(input_model)
out = solve(inp)
print(f"Status: {out['status']}, slots: {len(out['slots'])}, penalties: {out['penalties']}, wall {out['solver_stats']['wall_ms']}ms branches {out['solver_stats']['branches']}")

# Save variant3 slots with human readable fields for import (add source_* from catalog for convenience)
# Need to map subject/teacher names for human readability
subject_by_id = {s['id']: s for s in catalog['subjects']}
teacher_by_id = {t['id']: t for t in catalog['teachers']}
room_by_id = {r['id']: r for r in catalog['rooms']}

# Enrich slots with source_* for report (optional)
enriched=[]
for slot in out['slots']:
    subj = subject_by_id.get(slot['subject_id'], {})
    teach = teacher_by_id.get(slot['teacher_id'], {})
    room = room_by_id.get(slot['room_id'], {})
    enriched.append({
        **slot,
        "quarter": 4,
        "week": 1,
        "source_subject": subj.get('name', slot['subject_id']),
        "source_teacher": teach.get('full_name', slot['teacher_id']),
        "source_note": room.get('name',''),
        "source_time": f"{8+slot['period']}:00",
        "subgroup_label": slot.get('subgroup_label') or ""
    })

out_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"Saved {out_path} with {len(enriched)} slots")

# Also save full output for diagnostics
pathlib.Path(root/"data"/"q4_2026_variant3_output.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print("Done")

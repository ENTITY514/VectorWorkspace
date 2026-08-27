import sys, json, sqlite3
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).parent.parent

v1_path = root / "data" / "synthetic" / "schedule_q4_2026_variant1.json"
with open(v1_path, "r", encoding="utf-8") as f:
    v1_slots = json.load(f)

print("--- V1 SLOTS IN JSON BY CLASS ---")
class_counts = {}
mon_slots = {}
for s in v1_slots:
    cid = s["class_id"]
    class_counts[cid] = class_counts.get(cid, 0) + 1
    if s["day"] == 0: # Mon
        mon_slots[cid] = mon_slots.get(cid, 0) + 1

for cid in sorted(class_counts.keys()):
    print(f"Class ID '{cid}': total={class_counts[cid]} slots, Monday={mon_slots.get(cid, 0)} slots")

print("\n--- MONDAY SLOTS FOR CLASS 'c_2_normal' OR 'c_3a_normal' ---")
for s in v1_slots:
    if s["day"] == 0 and ("2" in s["class_id"] or "3a" in s["class_id"] or "3_a" in s["class_id"]):
        print(f"  Class: {s['class_id']}, Period: {s['period']+1}, Subj: {s['source_subject']}, Teacher: {s['source_teacher']}")

db_path = Path(r"C:\Users\imanb\AppData\Roaming\com.teacher.vectorworkspace\vector.db")
if db_path.exists():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    print("\n--- SQLITE DB SLOTS FOR VARIANT 'default' (V1) ---")
    cur.execute("SELECT class_id, count(*) FROM schedule_slots WHERE variant_id='default' GROUP BY class_id")
    for row in cur.fetchall():
        print(f"DB Class ID '{row[0]}': {row[1]} slots")
    conn.close()

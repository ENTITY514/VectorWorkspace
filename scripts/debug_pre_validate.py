import sqlite3, os, sys, json
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== CHECKING CURRICULUM HOURS PER CLASS ===")
cur.execute("SELECT class_id, SUM(hours_per_week) FROM schedule_curriculum GROUP BY class_id HAVING SUM(hours_per_week) > 35")
rows = cur.fetchall()
print("Classes > 35h:", rows)

print("\n=== CHECKING ROOM TYPE CAPACITIES ===")
cur.execute("SELECT id, required_room_type, requires_split FROM schedule_subjects WHERE required_room_type IS NOT NULL AND required_room_type != ''")
subjs = cur.fetchall()

cur.execute("SELECT room_type, COUNT(*) FROM schedule_rooms GROUP BY room_type")
rooms = dict(cur.fetchall())
print("Rooms count by type:", rooms)

for sid, rt, req_split in subjs:
    cur.execute("SELECT SUM(hours_per_week) FROM schedule_curriculum WHERE subject_id=?", (sid,))
    hrs = cur.fetchone()[0] or 0
    mult = 2 if req_split else 1
    total_needed = hrs * mult
    avail_rooms = rooms.get(rt, 0)
    avail_capacity = avail_rooms * 35 # 5 days * 7 periods
    if total_needed > avail_capacity:
        print(f"ROOM CONFLICT: Subject '{sid}' (type '{rt}'): needed {total_needed}h, available {avail_capacity}h ({avail_rooms} rooms * 35 slots)")

print("\n=== CHECKING TEACHER WORKLOAD VS SLOTS ===")
cur.execute("SELECT teacher_id, SUM(hours_per_week) FROM schedule_curriculum GROUP BY teacher_id")
t_hrs = cur.fetchall()

cur.execute("SELECT id, full_name, max_daily_lessons, availability_json FROM schedule_teachers")
teachers = {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}

for tid, hrs in t_hrs:
    if tid in teachers:
        name, max_daily, avail_str = teachers[tid]
        try:
            avail = json.loads(avail_str) if avail_str else []
            count = sum(sum(1 for p in day[:7] if p) for day in avail[:5]) if isinstance(avail, list) else 35
            if max_daily > 0:
                count = sum(min(max_daily, sum(1 for p in day[:7] if p)) for day in avail[:5]) if isinstance(avail, list) else 35
        except Exception:
            count = 35
        if hrs > count:
            print(f"TEACHER CONFLICT: '{name}' ({tid}): {hrs}h assigned, but only {count} slots available (max_daily={max_daily})")

conn.close()

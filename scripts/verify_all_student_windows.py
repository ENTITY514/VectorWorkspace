import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT DISTINCT class_id FROM schedule_slots WHERE variant_id='v3_q4'")
classes = [r[0] for r in cur.fetchall()]

total_student_windows = 0
for cid in sorted(classes):
    cur.execute("SELECT day, period FROM schedule_slots WHERE variant_id='v3_q4' AND class_id=? ORDER BY day, period", (cid,))
    slots = cur.fetchall()
    class_windows = 0
    for day in range(5):
        day_periods = sorted([s[1] for s in slots if s[0] == day])
        if len(day_periods) > 1:
            gaps = day_periods[-1] - day_periods[0] + 1 - len(day_periods)
            if gaps > 0:
                class_windows += gaps
    if class_windows > 0:
        print(f"Class {cid:8s}: FOUND {class_windows} WINDOWS!")
    total_student_windows += class_windows

print(f"\nTOTAL STUDENT WINDOWS ACROSS ALL {len(classes)} CLASSES IN SCHOOL: {total_student_windows}")
conn.close()

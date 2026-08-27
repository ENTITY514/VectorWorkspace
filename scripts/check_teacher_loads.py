import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== RADIONOVA CURRICULUM ===")
cur.execute("SELECT id, class_id, subject_id, teacher_id, hours_per_week, joint_lesson_id FROM schedule_curriculum WHERE teacher_id LIKE '%радионова%'")
for r in cur.fetchall():
    print(r)

print("\n=== PASHCHENKO CURRICULUM ===")
cur.execute("SELECT id, class_id, subject_id, teacher_id, hours_per_week, joint_lesson_id FROM schedule_curriculum WHERE teacher_id LIKE '%пащенко%'")
for r in cur.fetchall():
    print(r)

conn.close()

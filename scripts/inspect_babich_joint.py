import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== BABICH I. CURRICULUM ===")
cur.execute("""
SELECT id, class_id, subject_id, hours_per_week, joint_lesson_id 
FROM schedule_curriculum 
WHERE teacher_id LIKE '%бабич%' OR teacher_id LIKE '%babich%'
ORDER BY class_id, subject_id
""")
for row in cur.fetchall():
    print(f"Curriculum ID={row[0]}: class={row[1]}, subj={row[2]}, hours={row[3]}, joint_id={row[4]}")

print("\n=== BABICH I. SLOTS IN VARIANT 1 ('default') ===")
cur.execute("""
SELECT id, class_id, subject_id, day, period, joint_lesson_id 
FROM schedule_slots 
WHERE variant_id='default' AND (teacher_id LIKE '%бабич%' OR teacher_id LIKE '%babich%')
ORDER BY day, period, class_id
""")
for row in cur.fetchall():
    print(f"Slot: day={row[3]}, period={row[4]+1}, class={row[1]}, subj={row[2]}, joint_id={row[5]}")

conn.close()

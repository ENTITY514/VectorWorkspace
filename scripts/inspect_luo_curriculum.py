import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== ALL CURRICULUM ITEMS FOR LUO / DO CLASSES ===")
cur.execute("""
SELECT c.id, c.class_id, c.subject_id, c.teacher_id, c.hours_per_week, c.joint_lesson_id, t.full_name
FROM schedule_curriculum c
LEFT JOIN schedule_teachers t ON c.teacher_id = t.id
WHERE c.class_id LIKE '%luo%' OR c.class_id LIKE '%do%'
ORDER BY c.teacher_id, c.class_id
""")
for row in cur.fetchall():
    print(f"Teacher: {row[6]} ({row[3]}), Class: {row[1]}, Subj: {row[2]}, Hours: {row[4]}, JointID: {row[5]}")

conn.close()

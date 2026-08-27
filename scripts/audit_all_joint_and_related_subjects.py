import sqlite3, json, os, sys
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).parent.parent
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== 1. AUDITING ALL TEACHERS WITH LUO / DO & REGULAR CLASSES ===")
cur.execute("""
SELECT DISTINCT c.teacher_id, t.full_name
FROM schedule_curriculum c
JOIN schedule_teachers t ON c.teacher_id = t.id
WHERE c.class_id LIKE '%luo%' OR c.class_id LIKE '%do%'
""")
luo_teachers = cur.fetchall()

for tid, tname in luo_teachers:
    print(f"\n--- TEACHER: {tname} ({tid}) ---")
    cur.execute("""
    SELECT class_id, subject_id, hours_per_week, joint_lesson_id
    FROM schedule_curriculum
    WHERE teacher_id = ?
    ORDER BY class_id, subject_id
    """, (tid,))
    items = cur.fetchall()
    by_class = defaultdict(list)
    for cid, sid, hrs, jid in items:
        by_class[cid].append((sid, hrs, jid))
    
    for cid, subjs in by_class.items():
        subjs_str = ", ".join([f"{s}({h}h, jid={j})" for s, h, j in subjs])
        print(f"  Class {cid:8s}: {subjs_str}")

print("\n=== 2. ALL SUBJECTS IN DB ===")
cur.execute("SELECT id, name, related_subjects_json FROM schedule_subjects")
subjects = cur.fetchall()
for sid, sname, rel in subjects:
    print(f"  Subject: id={sid:25s}, name={sname:25s}, related={rel}")

conn.close()

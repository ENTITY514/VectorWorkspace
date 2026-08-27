import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт"]

print("=== CHECKING ALL LUO & DO CLASSES FOR 7TH PERIOD & WINDOWS ===")
cur.execute("SELECT DISTINCT class_id FROM schedule_slots WHERE variant_id='v3_q4' AND (class_id LIKE '%luo%' OR class_id LIKE '%do%')")
luo_classes = [r[0] for r in cur.fetchall()]

for cid in sorted(luo_classes):
    cur.execute("SELECT day, period+1, subject_id FROM schedule_slots WHERE variant_id='v3_q4' AND class_id=? ORDER BY day, period", (cid,))
    slots = cur.fetchall()
    p7_slots = [s for s in slots if s[1] == 7]
    print(f"Class {cid:8s}: {len(slots)} total slots, 7th period slots: {len(p7_slots)}")

print("\n=== 7-б & 7-б ЛУО SLOTS IN V3 (CP-SAT) ===")
cur.execute("SELECT day, period+1, class_id, subject_id, joint_lesson_id FROM schedule_slots WHERE variant_id='v3_q4' AND class_id IN ('7б', '7б_luo') ORDER BY day, period, class_id")
for r in cur.fetchall():
    print(f"  {DAY_NAMES[r[0]]}, Урок {r[1]}: class={r[2]:8s}, subj={r[3]:20s}, joint={r[4]}")

print("\n=== ALL MATH SLOTS (ALGEBRA/GEOMETRY/MATH) IN V3 (CP-SAT) ===")
cur.execute("SELECT day, period+1, class_id, subject_id FROM schedule_slots WHERE variant_id='v3_q4' AND (subject_id IN ('algebra', 'geometry', 'math') OR subject_id LIKE '%math%') ORDER BY day, period, class_id")
math_slots = cur.fetchall()
p7_math = [s for s in math_slots if s[1] == 7]
p6_math = [s for s in math_slots if s[1] == 6]
print(f"Total Math Slots across all classes in V3: {len(math_slots)}")
print(f"Math Slots on 7th period: {len(p7_math)}")
print(f"Math Slots on 6th period: {len(p6_math)}")

conn.close()

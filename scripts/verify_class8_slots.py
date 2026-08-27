import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт"]

print("=== CLASS 8 SLOTS IN VARIANT 3 (CP-SAT) ===")
cur.execute("SELECT day, period+1, subject_id FROM schedule_slots WHERE variant_id='v3_q4' AND class_id='8' ORDER BY day, period")
for r in cur.fetchall():
    print(f"  {DAY_NAMES[r[0]]}, Урок {r[1]}: {r[2]}")

conn.close()

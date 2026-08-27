import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== SUBJECTS RELATED_SUBJECTS_JSON ===")
cur.execute("SELECT id, name, related_subjects_json FROM schedule_subjects WHERE id IN ('algebra', 'geometry', 'math') OR name LIKE '%алгебр%' OR name LIKE '%геометр%'")
for r in cur.fetchall():
    print(r)

conn.close()

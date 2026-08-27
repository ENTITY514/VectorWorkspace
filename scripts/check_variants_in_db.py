import sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT DISTINCT variant_id FROM schedule_slots")
print("Variant IDs in DB:", cur.fetchall())

cur.execute("SELECT DISTINCT class_id FROM schedule_slots")
print("Class IDs in DB:", cur.fetchall())

conn.close()

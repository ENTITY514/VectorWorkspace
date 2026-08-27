import sqlite3, json, os, sys
from pathlib import Path

root = Path(__file__).parent.parent
sys.path.insert(0, str(root))

sys.stdout.reconfigure(encoding='utf-8')

appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"
print(f"Target DB: {db_path}")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Recreate schedule_slots without restrictive teacher/room UNIQUE constraints
cur.executescript("""
PRAGMA foreign_keys = OFF;

CREATE TABLE schedule_slots_temp (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES schedule_classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES schedule_subjects(id) ON DELETE RESTRICT,
    teacher_id TEXT NOT NULL REFERENCES schedule_teachers(id) ON DELETE RESTRICT,
    room_id TEXT NOT NULL REFERENCES schedule_rooms(id) ON DELETE RESTRICT,
    subgroup_label TEXT NOT NULL DEFAULT '',
    day INTEGER NOT NULL,
    period INTEGER NOT NULL,
    is_double INTEGER NOT NULL DEFAULT 0,
    variant_id TEXT NOT NULL DEFAULT 'default' REFERENCES schedule_variants(id) ON DELETE CASCADE,
    joint_lesson_id TEXT,
    UNIQUE (class_id, day, period, subgroup_label, variant_id)
);

INSERT INTO schedule_slots_temp 
    (id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id)
SELECT id, class_id, subject_id, teacher_id, room_id, subgroup_label, day, period, is_double, variant_id, joint_lesson_id
FROM schedule_slots;

DROP TABLE schedule_slots;
ALTER TABLE schedule_slots_temp RENAME TO schedule_slots;

CREATE INDEX IF NOT EXISTS idx_slots_variant ON schedule_slots(variant_id);
CREATE INDEX IF NOT EXISTS idx_slots_class ON schedule_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_slots_teacher ON schedule_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_slots_room ON schedule_slots(room_id);
CREATE INDEX IF NOT EXISTS idx_slots_joint ON schedule_slots(joint_lesson_id);

PRAGMA foreign_keys = ON;
""")

conn.commit()
conn.close()

print("Database schema updated! Re-running reseed_sqlite_db.py...")
import scripts.reseed_sqlite_db

# Check slot counts in SQLite now
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("\n--- SQLITE DB SLOTS FOR VARIANT 'default' (V1) AFTER FIX ---")
cur.execute("SELECT class_id, count(*) FROM schedule_slots WHERE variant_id='default' GROUP BY class_id ORDER BY class_id")
for row in cur.fetchall():
    print(f"DB Class ID '{row[0]}': {row[1]} slots")

print("\n--- MONDAY SLOTS FOR CLASS '3а' (V1) IN DB ---")
cur.execute("SELECT day, period+1, subject_id, teacher_id, room_id FROM schedule_slots WHERE variant_id='default' AND class_id='3а' AND day=0 ORDER BY period")
for row in cur.fetchall():
    print(f"  Day {row[0]}, Period {row[1]}: Subj={row[2]}, Teacher={row[3]}, Room={row[4]}")

conn.close()

import json, sqlite3, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).parent.parent
sys.path.insert(0, str(root))

cat_path = root / "data" / "synthetic" / "catalog.json"
with open(cat_path, "r", encoding="utf-8") as f:
    cat = json.load(f)

for s in cat.get("subjects", []):
    if s["id"] == "algebra":
        s["related_subjects_json"] = '["geometry"]'
    elif s["id"] == "geometry":
        s["related_subjects_json"] = '["algebra"]'

with open(cat_path, "w", encoding="utf-8") as f:
    json.dump(cat, f, ensure_ascii=False, indent=2)
print("Updated catalog.json related_subjects_json for algebra and geometry!")

# Update SQLite DB
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"
if db_path.exists():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("UPDATE schedule_subjects SET related_subjects_json='[\"geometry\"]' WHERE id='algebra'")
    cur.execute("UPDATE schedule_subjects SET related_subjects_json='[\"algebra\"]' WHERE id='geometry'")
    conn.commit()
    conn.close()
    print("Updated SQLite DB schedule_subjects related_subjects_json!")

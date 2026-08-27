import json
from pathlib import Path

root = Path(__file__).parent.parent
cat_path = root / "data" / "synthetic" / "catalog.json"
with open(cat_path, "r", encoding="utf-8") as f:
    cat = json.load(f)

print("Catalog top keys:", list(cat.keys()))
if "subjects" in cat:
    for s in cat["subjects"]:
        if "algebra" in s["id"] or "geometry" in s["id"] or "math" in s["id"]:
            print(s)

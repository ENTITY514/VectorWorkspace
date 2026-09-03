import sqlite3
import os
import sys
from pathlib import Path

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')

appdata = os.environ.get('APPDATA', '')
paths = [
    Path(appdata) / 'vector-workspace-desktop' / 'vector.db',
    Path(appdata) / 'com.teacher.vectorworkspace' / 'vector.db',
    Path('Desktop/src-tauri/vector.db')
]

for p in paths:
    if p.exists():
        print(f"=== Database found: {p} ({p.stat().st_size / 1024 / 1024:.2f} MB) ===")
        conn = sqlite3.connect(p)
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print(f"Tables ({len(tables)}):", tables)
        for t in tables:
            cnt = cur.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            print(f"  {t:<25} : {cnt:6d} rows")
        conn.close()

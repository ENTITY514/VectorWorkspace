import json, sqlite3, os, sys
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).parent.parent
sys.path.insert(0, str(root))

cat_path = root / "data" / "synthetic" / "catalog.json"
with open(cat_path, "r", encoding="utf-8") as f:
    cat = json.load(f)

# 1. Update related_subjects_json in catalog.json
related_map = {
    "algebra": ["geometry"],
    "geometry": ["algebra"],
    "history_kz": ["history_world", "xls_9c595eca2c44"],
    "history_world": ["history_kz"],
    "xls_9c595eca2c44": ["history_kz"],
    "russian": ["literature", "xls_be32892d5985", "xls_ee02542adfa7"],
    "literature": ["russian"],
    "xls_be32892d5985": ["russian"],
    "xls_ee02542adfa7": ["russian"],
    "kazakh_language": ["kazakh_literature", "xls_d7a11dfa2765"],
    "kazakh_literature": ["kazakh_language"],
    "xls_d7a11dfa2765": ["kazakh_language"],
    "physics": ["chemistry", "biology"],
    "chemistry": ["physics", "biology"],
    "biology": ["physics", "chemistry"],
    "izo": ["trud", "xls_89eeb6bf7feb", "xls_3347cdc0f735"],
    "trud": ["izo"],
    "xls_89eeb6bf7feb": ["izo"],
    "xls_3347cdc0f735": ["izo"],
}

for s in cat.get("subjects", []):
    sid = s["id"]
    if sid in related_map:
        s["related_subjects_json"] = json.dumps(related_map[sid], ensure_ascii=False)

with open(cat_path, "w", encoding="utf-8") as f:
    json.dump(cat, f, ensure_ascii=False, indent=2)
print("1. Updated catalog.json with complete related_subjects_json!")

# 2. Update SQLite DB schedule_subjects
appdata = os.getenv('APPDATA')
db_path = Path(appdata) / "com.teacher.vectorworkspace" / "vector.db"
if db_path.exists():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    for sid, rel_list in related_map.items():
        cur.execute("UPDATE schedule_subjects SET related_subjects_json=? WHERE id=?", (json.dumps(rel_list, ensure_ascii=False), sid))
    conn.commit()
    conn.close()
    print("2. Updated SQLite DB schedule_subjects with related_subjects_json!")

# 3. Update update_q4_joint_lessons.py for all multi-subject joint rules
script_path = root / "scripts" / "update_q4_joint_lessons.py"
with open(script_path, "r", encoding="utf-8") as f:
    code = f.read()

# Make sure all joint pairings are mapped cleanly
joint_rules_code = '''# Unify joint_lesson_id for multi-subject joint curriculum groups across LUO/DO & regular classes
multi_subject_joint_rules = [
    # (teacher_id, (class_group), (subject_group), joint_id_name)
    ("бабич_ид", ("7б", "7б_luo"), ("algebra", "geometry", "math"), "jl_бабич_ид_7б_math"),
    ("бабич_ид", ("9", "9_luo"), ("algebra", "geometry", "math"), "jl_бабич_ид_9_math"),
    ("жолдан_аб", ("7б", "7б_luo"), ("russian", "literature", "xls_6bff7fd8e0e9"), "jl_жолдан_аб_7б_rus"),
    ("дмитриев_ев", ("5б", "5_luo"), ("russian", "literature", "xls_6bff7fd8e0e9"), "jl_дмитриев_ев_5_rus"),
    ("дмитриев_ев", ("9", "9_luo"), ("russian", "literature", "xls_6bff7fd8e0e9"), "jl_дмитриев_ев_9_rus"),
    ("досаева_мх", ("7б", "7б_luo"), ("history_kz", "history_world", "history"), "jl_досаева_мх_7б_hist"),
    ("темерканова_ов", ("7б", "7б_luo"), ("literature", "xls_6bff7fd8e0e9"), "jl_темерканова_ов_7б_lit"),
    ("красноперова_ов", ("7б", "7б_luo"), ("biology", "geography", "estestvoznanie", "xls_2e044454979d"), "jl_красноперова_ов_7б_science"),
    ("иващенко_во", ("6", "6_luo"), ("biology", "estestvoznanie", "xls_2e044454979d"), "jl_иващенко_во_6_science"),
    ("ольков_гв", ("3б", "3_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_ольков_гв_3_pe"),
    ("ольков_гв", ("5б", "5_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_ольков_гв_5_pe"),
    ("ольков_гв", ("7б", "7б_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_ольков_гв_7б_pe"),
    ("чифин_дн", ("3б", "3_luo"), ("pe", "xls_c8eeb4eac5ee"), "jl_чифин_дн_3_pe"),
    ("шкиря_юн", ("3б", "3_luo"), ("music", "музыкаипение"), "jl_шкиря_юн_3_music"),
    ("шкиря_юн", ("5б", "5_luo"), ("music", "музыкаипение"), "jl_шкиря_юн_5_music"),
    ("шкиря_юн", ("6", "6_luo"), ("music", "музыкаипение"), "jl_шкиря_юн_6_music"),
]

for c in curriculum:
    for tid, c_grp, s_grp, jid in multi_subject_joint_rules:
        if c["teacher_id"] == tid and c["class_id"] in c_grp and c["subject_id"] in s_grp:
            c["joint_lesson_id"] = jid
'''

target_marker = '# Unify joint_lesson_id for Babich math curriculum across 7б/7б_luo and 9/9_luo'
if target_marker in code:
    lines = code.splitlines()
    start_idx = -1
    for i, line in enumerate(lines):
        if target_marker in line:
            start_idx = i
            break
    if start_idx != -1:
        # replace from start_idx to the end of that loop
        new_lines = lines[:start_idx] + [joint_rules_code] + lines[start_idx+6:]
        with open(script_path, "w", encoding="utf-8") as f:
            f.write("\n".join(new_lines))
        print("3. Updated update_q4_joint_lessons.py with multi-subject joint rules!")


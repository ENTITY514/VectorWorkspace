"""Перенос данных BilimClass и готовых вариантов расписания в базу программы.

Трогает ТОЛЬКО таблицы schedule_*. ТУП, КТП/КСП, справочники школы не меняются.
Перед записью делает резервную копию vector.db рядом с ней.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path

from dataset import DAYS, PERIODS, School, grade_of, load

DB_PATH = Path(os.environ.get("VECTOR_DB") or
               Path(os.environ["APPDATA"]) / "com.teacher.vectorworkspace" / "vector.db")

SUBJECT_IDS = {
    "Алгебра": "algebra",
    "Алгебра и начала анализа": "algebra_analysis",
    "Геометрия": "geometry",
    "Математика": "math",
    "История Казахстана": "history_kz",
    "Всемирная история": "history_world",
    "Русский язык": "russian",
    "Русская литература": "literature",
    "Русский язык и литература": "russian_lang_lit",
    "Литературное чтение": "reading",
    "Чтение и развитие речи": "reading_speech",
    "Казахский язык": "kazakh_language",
    "Казахская литература": "kazakh_literature",
    "Казахский язык и литература": "kazakh_lang_lit",
    "Иностранный язык": "foreign_language",
    "Английский язык": "english",
    "Физика": "physics",
    "Химия": "chemistry",
    "Биология": "biology",
    "География": "geography",
    "Естествознание": "estestvoznanie",
    "Познание мира": "poznanie",
    "Обучение грамоте": "gramota",
    "Музыка": "music",
    "Изобразительное искусство": "izo",
    "Трудовое обучение": "trud",
    "Художественный труд": "art_labor",
    "Физическая культура": "pe",
    "Адаптивная физическая культура": "adaptive_pe",
    "Информатика и искусственный интеллект": "informatics",
    "Цифровая грамотность и искусственный интеллект": "digital_literacy",
    "Начальная военная подготовка": "nvp",
    "Основы права": "law",
    "Основы предпринимательства и бизнеса": "business",
}

ROOM_TYPES = {"General", "ChemistryLab", "PhysicsLab", "BiologyLab", "Informatics", "LanguageLab", "Gym", "Workshop"}
COMBINED = {"Аятова Анаргуль Жусуповна", "Байгазиева Айгерим Дуйсембековна", "Балташева Зару Такановна",
            "Жантимиров Асхат Каскарбаевич", "Жантимиров Эльдар Асхатович", "Иващенко Виталий Олегович",
            "Сапаргалиева Гульжихан Сансызбаевна", "Сидоров Виктор Борисович"}


def teacher_id(fio: str) -> str:
    p = fio.lower().split()
    return "t_" + p[0] + "_" + "".join(x[0] for x in p[1:3])


def class_id(name: str) -> str:
    return name.lower()


def backup() -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = DB_PATH.with_name(f"vector.db.bak-{stamp}")
    src = sqlite3.connect(DB_PATH)
    out = sqlite3.connect(dst)
    src.backup(out)
    out.close()
    src.close()
    return dst


def import_all(school: School, variants: list[dict], weights: dict) -> dict:
    """variants: [{id, name, number, active, res}]"""
    bak = backup()
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()
    classes_raw = {c["class_name"]: c for c in load("classes.json")["classes"] if c["status"] == "active"}
    room_rules = load("room_rules.json")
    weights_raw = load("subject_weights.json")
    tids = {t: teacher_id(t) for t in school.teachers}
    if len(set(tids.values())) != len(tids):
        raise ValueError("коллизия id учителей")

    with con:
        for tbl in ["schedule_slots", "schedule_fixed_slots", "schedule_variants", "schedule_curriculum",
                    "schedule_subgroup_rules"]:
            cur.execute(f"DELETE FROM {tbl}")
        cur.execute("UPDATE schedule_rooms SET base_teacher_id = NULL")
        cur.execute("UPDATE schedule_teachers SET base_room_id = NULL")
        for tbl in ["schedule_teachers", "schedule_rooms", "schedule_subjects", "schedule_classes"]:
            cur.execute(f"DELETE FROM {tbl}")

        cur.execute("INSERT OR REPLACE INTO schedule_settings (id, days_per_week, periods_per_day, shift_boundary_period) "
                    "VALUES ('default', ?, ?, NULL)", (DAYS, PERIODS))
        cur.execute("INSERT OR REPLACE INTO schedule_weights (id, window, room_displacement, sanpin_parabola, alternation, "
                    "movement, load_balance, change_slot) VALUES ('default', ?, ?, ?, ?, 0, ?, 0)",
                    (weights["window"], weights["room"], weights["sanpin"], weights["alternation"], weights["load_balance"]))

        for rid, r in school.rooms.items():
            rt = r["room_type"] if r["room_type"] in ROOM_TYPES else "General"
            cur.execute("INSERT INTO schedule_rooms (id, name, room_type, capacity, base_teacher_id, floor) VALUES (?,?,?,?,NULL,NULL)",
                        (rid, r["name"], rt, max(1, min(200, r.get("capacity") or 30))))

        base_room = {t: rs[0] for t, rs in room_rules["teacher_rooms"].items() if rs and rs[0] in school.rooms}
        subj_by_teacher: dict[str, set[str]] = {}
        for mt in school.meetings:
            for sec in mt.sections:
                subj_by_teacher.setdefault(sec.teacher, set()).update(SUBJECT_IDS[s] for s in sec.subjects)
        for t in school.teachers:
            av = [list(row) for row in school.availability[t]] + [[False] * PERIODS]
            cur.execute("INSERT INTO schedule_teachers (id, full_name, base_room_id, max_daily_lessons, availability_json, "
                        "subject_ids, is_combined, quarter_number) VALUES (?,?,?,?,?,?,?,NULL)",
                        (tids[t], t, base_room.get(t), 0, json.dumps(av), json.dumps(sorted(subj_by_teacher.get(t, []))),
                         1 if t in COMBINED else 0))
        for t, rid in base_room.items():
            if t in tids:
                cur.execute("UPDATE schedule_rooms SET base_teacher_id = ? WHERE id = ?", (tids[t], rid))

        li, ld = weights_raw["language_independent"], weights_raw["language_dependent"]
        fixed_types = room_rules["fixed_room_types"]
        related: dict[str, set[str]] = {}
        for g in school.related_groups:
            for a in g:
                related.setdefault(a, set()).update(x for x in g if x != a)
        for name, sid in SUBJECT_IDS.items():
            w = li.get(name) or (ld[name]["ru"] if name in ld else 5)
            rt = fixed_types.get(name)
            rt = rt if rt in ROOM_TYPES else None
            rel = sorted(SUBJECT_IDS[x] for x in related.get(name, set()) if x in SUBJECT_IDS)
            cur.execute("INSERT INTO schedule_subjects (id, name, sanitary_weight, required_room_type, requires_split, "
                        "is_double_allowed, related_subjects_json) VALUES (?,?,?,?,0,0,?)",
                        (sid, name, max(1, min(10, w)), rt, json.dumps(rel)))

        for c in school.classes:
            raw = classes_raw.get(c, {})
            letter = re.sub(r"^\d+", "", c).lower()
            cur.execute("INSERT INTO schedule_classes (id, grade, letter, headcount, shift, class_type, quarter_number) "
                        "VALUES (?,?,?,?, 'First', ?, NULL)",
                        (class_id(c), grade_of(c), letter, max(1, min(50, raw.get("headcount") or 1)),
                         school.class_type.get(c, "normal")))

        split_rules = []
        for e in school.curriculum_entries:
            fios = list(dict.fromkeys(t["fio"] for t in e["teachers"]))
            t2 = tids[fios[1]] if len(fios) > 1 else None
            jl = (e.get("joint_lessons") or [None])[0]
            cid, sid = class_id(e["class_name"]), SUBJECT_IDS[e["subject_name"]]
            cur.execute("INSERT INTO schedule_curriculum (id, class_id, subject_id, teacher_id, split_teacher2_id, "
                        "hours_per_week, joint_lesson_id) VALUES (?,?,?,?,?,?,?)",
                        (f"c_{cid}_{sid}", cid, sid, tids[fios[0]], t2, e["weekly_hours"], jl))
            if e.get("split") or e.get("requires_split"):
                split_rules.append((f"sg_{cid}_{sid}", cid, sid))
        cur.executemany("INSERT INTO schedule_subgroup_rules (id, class_id, subject_id, group_count) VALUES (?,?,?,2)",
                        split_rules)

        n_slots = 0
        for v in variants:
            cur.execute("INSERT INTO schedule_variants (id, name, academic_year, is_active, parent_variant_id, "
                        "quarter_number, variant_number) VALUES (?,?,?,?,NULL,1,?)",
                        (v["id"], v["name"], "2026-2027", 1 if v["active"] else 0, v["number"]))
            res = v["res"]
            rows = []
            for mi, mt in enumerate(school.meetings):
                d, p = res["slots"][str(mi)]
                for si, sec in enumerate(mt.sections):
                    rid = res["rooms"][f"{mi}|{si}"]
                    for c, sub, sj in sec.attendees:
                        label = sub or ""
                        rows.append((f"{v['id']}_{class_id(c)}_{d}_{p}_{label}", class_id(c), SUBJECT_IDS[sj],
                                     tids[sec.teacher], rid, label, d, p, v["id"], mt.joint_id))
            cur.executemany("INSERT INTO schedule_slots (id, class_id, subject_id, teacher_id, room_id, subgroup_label, "
                            "day, period, is_double, variant_id, joint_lesson_id) VALUES (?,?,?,?,?,?,?,?,0,?,?)", rows)
            n_slots += len(rows)
    counts = {t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
              for t in ["schedule_classes", "schedule_teachers", "schedule_rooms", "schedule_subjects",
                        "schedule_curriculum", "schedule_variants", "schedule_slots"]}
    con.close()
    return {"backup": str(bak), "counts": counts}

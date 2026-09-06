#!/usr/bin/env python3
"""Apply parsed 399 math TUPs to seed JSON and the live SQLite DB.

Preserves document IDs and existing learning_objective IDs so KTP
lesson → objective FKs stay valid.
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(r"E:\Projects\VectorWorkspace")
SEED = ROOT / "Desktop" / "src-tauri" / "seed" / "tup_ru.json"
PARSED = ROOT / "scripts" / "_399_extract" / "math_tup_parsed.json"
DB = Path(r"C:\Users\imanb\AppData\Roaming\com.teacher.vectorworkspace\vector.db")

KEY_BY_APPENDIX = {
    53: ("algebra", "7-9", "common", "RU"),
    54: ("geometry", "7-9", "common", "RU"),
    104: ("algebra_analysis", "10-11", "emn", "RU"),
    105: ("algebra_analysis", "10-11", "ogn", "RU"),
    106: ("geometry", "10-11", "emn", "RU"),
    107: ("geometry", "10-11", "ogn", "RU"),
}


def load_parsed() -> dict[int, dict]:
    docs = json.loads(PARSED.read_text(encoding="utf-8"))
    best = {}
    for d in docs:
        if d.get("stats", {}).get("paras", 0) <= 2:
            continue
        best[d["appendix_number"]] = d
    return best


def merge_objectives(seed_objs: list[dict], new_objs: list[dict]) -> list[dict]:
    by_code = {o["code"]: dict(o) for o in seed_objs}
    for o in new_objs:
        prev = by_code.get(o["code"])
        if prev:
            prev["description"] = o["description"]
            prev["grade"] = o["grade"]
            prev["section_number"] = o["section_number"]
            prev["subsection_number"] = o["subsection_number"]
            prev["objective_number"] = o["objective_number"]
        else:
            by_code[o["code"]] = dict(o)
    return list(by_code.values())


def apply_to_seed(parsed: dict[int, dict]) -> None:
    export = json.loads(SEED.read_text(encoding="utf-8"))
    index = {}
    for i, d in enumerate(export["documents"]):
        key = (d["subject_id"], d["target_grades"], d.get("direction", "common"), d["language"])
        index[key] = i

    for app, key in KEY_BY_APPENDIX.items():
        src = parsed[app]
        i = index[key]
        dst = export["documents"][i]
        dst["order_number"] = src["order_number"]
        dst["order_date"] = src["order_date"]
        dst["appendix_number"] = app
        dst["legal_basis"] = src["legal_basis"]
        dst["goal_text"] = src["goal_text"]
        dst["tasks"] = src["tasks"]
        dst["hours"] = src["hours"]
        dst["objectives"] = merge_objectives(dst.get("objectives") or [], src["objectives"])
        dst["quarters"] = src["quarters"]

    export["generated_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    export["source"] = (
        str(ROOT / "Materials" / "399 приказ 2026-2027")
        + " (алгебра/геометрия 7-11 обновлены из DOCX 2026-2027)"
    )
    SEED.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"seed updated: {SEED}")


def backup_db() -> Path:
    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    bak = Path(str(DB) + f".bak.{ts}")
    shutil.copyfile(DB, bak)
    print(f"db backup: {bak}")
    return bak


def apply_to_db(parsed: dict[int, dict]) -> None:
    conn = sqlite3.connect(str(DB))
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    for app, key in KEY_BY_APPENDIX.items():
        subj, grades, direction, lang = key
        src = parsed[app]
        row = cur.execute(
            """
            SELECT id FROM tup_documents
            WHERE subject_id=? AND target_grades=? AND direction=? AND language=?
            """,
            (subj, grades, direction, lang),
        ).fetchone()
        if not row:
            raise SystemExit(f"document not found in DB: {key}")
        doc_id = row[0]

        cur.execute(
            """
            UPDATE tup_documents
            SET order_number=?, order_date=?, appendix_number=?, legal_basis=?, goal_text=?
            WHERE id=?
            """,
            (src["order_number"], src["order_date"], app, src["legal_basis"], src["goal_text"], doc_id),
        )

        cur.execute("DELETE FROM tup_document_tasks WHERE document_id=?", (doc_id,))
        for i, text in enumerate(src["tasks"]):
            cur.execute(
                "INSERT INTO tup_document_tasks (id, document_id, order_index, task_text) VALUES (?,?,?,?)",
                (str(uuid.uuid4()), doc_id, i, text),
            )

        cur.execute("DELETE FROM tup_subject_hours WHERE document_id=?", (doc_id,))
        for h in src["hours"]:
            cur.execute(
                """
                INSERT INTO tup_subject_hours (id, document_id, grade, hours_per_week, hours_per_year)
                VALUES (?,?,?,?,?)
                """,
                (str(uuid.uuid4()), doc_id, h["grade"], h["hours_per_week"], h["hours_per_year"]),
            )

        existing = {
            r[1]: r[0]
            for r in cur.execute(
                "SELECT id, code FROM learning_objectives WHERE document_id=?", (doc_id,)
            )
        }
        for o in src["objectives"]:
            if o["code"] in existing:
                cur.execute(
                    """
                    UPDATE learning_objectives
                    SET grade=?, section_number=?, subsection_number=?, objective_number=?, description=?
                    WHERE id=?
                    """,
                    (
                        o["grade"],
                        o["section_number"],
                        o["subsection_number"],
                        o["objective_number"],
                        o["description"],
                        existing[o["code"]],
                    ),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO learning_objectives
                    (id, document_id, grade, section_number, subsection_number, objective_number, description, code)
                    VALUES (?,?,?,?,?,?,?,?)
                    """,
                    (
                        str(uuid.uuid4()),
                        doc_id,
                        o["grade"],
                        o["section_number"],
                        o["subsection_number"],
                        o["objective_number"],
                        o["description"],
                        o["code"],
                    ),
                )

        cur.execute("DELETE FROM tup_quarters WHERE document_id=?", (doc_id,))
        for q in src["quarters"]:
            qid = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO tup_quarters (id, document_id, grade, quarter_number) VALUES (?,?,?,?)",
                (qid, doc_id, q["grade"], q["quarter_number"]),
            )
            for si, s in enumerate(q.get("sections") or []):
                sid = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO tup_sections (id, quarter_id, name, order_index) VALUES (?,?,?,?)",
                    (sid, qid, s.get("name") or "", si),
                )
                for ti, t in enumerate(s.get("topics") or []):
                    tid = str(uuid.uuid4())
                    cur.execute(
                        "INSERT INTO tup_topics (id, section_id, name, order_index) VALUES (?,?,?,?)",
                        (tid, sid, t.get("name") or "", ti),
                    )
                    for code in t.get("objective_codes") or []:
                        cur.execute(
                            "INSERT OR IGNORE INTO tup_topic_objectives (topic_id, objective_code) VALUES (?,?)",
                            (tid, code),
                        )

        print(
            f"  {subj} {grades} {direction}: hours={len(src['hours'])} "
            f"tasks={len(src['tasks'])} objs={len(src['objectives'])} "
            f"quarters={len(src['quarters'])}"
        )

    conn.commit()
    try:
        cur.execute("INSERT INTO tup_fts(tup_fts) VALUES('rebuild')")
        conn.commit()
        print("FTS rebuilt")
    except sqlite3.Error as e:
        print(f"FTS rebuild skipped: {e}")
    conn.close()


def verify() -> None:
    c = sqlite3.connect(str(DB))
    rows = c.execute(
        """
        SELECT d.subject_id, d.target_grades, d.direction,
               (SELECT COUNT(*) FROM tup_subject_hours h WHERE h.document_id=d.id),
               (SELECT COUNT(*) FROM tup_document_tasks t WHERE t.document_id=d.id),
               (SELECT COUNT(*) FROM learning_objectives o WHERE o.document_id=d.id),
               (SELECT COUNT(*) FROM tup_quarters q WHERE q.document_id=d.id),
               (SELECT COUNT(*) FROM tup_quarters q WHERE q.document_id=d.id AND q.grade=11)
        FROM tup_documents d
        WHERE d.subject_id IN ('algebra','geometry','algebra_analysis') AND d.language='RU'
        ORDER BY d.appendix_number
        """
    ).fetchall()
    print("VERIFY (hours, tasks, objs, quarters, q11):")
    for r in rows:
        print(" ", r)
    ktp = c.execute("SELECT COUNT(*) FROM ktp_lesson_objectives").fetchone()[0]
    print("ktp_lesson_objectives still", ktp)


def main():
    parsed = load_parsed()
    missing = [a for a in KEY_BY_APPENDIX if a not in parsed]
    if missing:
        raise SystemExit(f"parsed docs missing: {missing}")
    apply_to_seed(parsed)
    backup_db()
    apply_to_db(parsed)
    verify()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Merge parsed 399 TUPs into seed JSON and the live SQLite DB.

Keeps existing document IDs and learning_objective IDs so KTP FKs stay valid.
Inserts documents that appear in the new parse but not in the DB.
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"E:\Projects\VectorWorkspace")
SEED_RU = ROOT / "Desktop" / "src-tauri" / "seed" / "tup_ru.json"
SEED_KZ = ROOT / "Desktop" / "src-tauri" / "seed" / "tup_kz.json"
PARSED = ROOT / "scripts" / "_399_extract" / "all_tup_parsed.json"
DB = Path(r"C:\Users\imanb\AppData\Roaming\com.teacher.vectorworkspace\vector.db")


def key_of(d: dict) -> tuple:
    return (
        d["subject_id"],
        d["target_grades"],
        d.get("direction", "common"),
        d["language"],
        int(d["appendix_number"]),
    )


def soft_key(d: dict) -> tuple:
    return (
        d["subject_id"],
        d["target_grades"],
        d.get("direction", "common"),
        d["language"],
    )


def merge_objectives(seed_objs: list[dict], new_objs: list[dict]) -> list[dict]:
    by_code = {o["code"]: dict(o) for o in seed_objs}
    for o in new_objs:
        prev = by_code.get(o["code"])
        if prev:
            prev.update(
                {
                    "description": o["description"],
                    "grade": o["grade"],
                    "section_number": o["section_number"],
                    "subsection_number": o["subsection_number"],
                    "objective_number": o["objective_number"],
                }
            )
        else:
            by_code[o["code"]] = dict(o)
    return list(by_code.values())


def apply_fields(dst: dict, src: dict) -> None:
    dst["order_number"] = src["order_number"]
    dst["order_date"] = src["order_date"]
    dst["appendix_number"] = src["appendix_number"]
    if src.get("direction"):
        dst["direction"] = src["direction"]
    if src.get("subject_name"):
        dst["subject_name"] = src["subject_name"]
    dst["legal_basis"] = src.get("legal_basis") or dst.get("legal_basis") or ""
    dst["goal_text"] = src.get("goal_text") or dst.get("goal_text") or ""
    if src.get("tasks"):
        dst["tasks"] = src["tasks"]
    if src.get("hours"):
        dst["hours"] = src["hours"]
    dst["objectives"] = merge_objectives(dst.get("objectives") or [], src.get("objectives") or [])
    if src.get("quarters"):
        dst["quarters"] = src["quarters"]


def apply_to_seed(parsed: list[dict]) -> None:
    ru = json.loads(SEED_RU.read_text(encoding="utf-8"))
    kz = json.loads(SEED_KZ.read_text(encoding="utf-8"))
    by_key = {}
    by_app = {}
    by_soft = {}
    for bucket, export in (("RU", ru), ("KZ", kz)):
        for i, d in enumerate(export["documents"]):
            by_key[(bucket, key_of(d))] = (export, i)
            by_app[(bucket, d["language"], int(d["appendix_number"]))] = (export, i)
            by_soft.setdefault((bucket, soft_key(d)), []).append(i)

    updated = 0
    added = 0
    for src in parsed:
        if not src.get("objectives") and not src.get("hours"):
            continue
        bucket = "KZ" if src["language"] == "KZ" else "RU"
        export = kz if bucket == "KZ" else ru
        k = (bucket, key_of(src))
        if k in by_key:
            _, i = by_key[k]
            apply_fields(export["documents"][i], src)
            updated += 1
            continue
        app_k = (bucket, src["language"], int(src["appendix_number"]))
        if app_k in by_app:
            _, i = by_app[app_k]
            if export["documents"][i]["subject_id"] == src["subject_id"]:
                apply_fields(export["documents"][i], src)
                updated += 1
                continue
        soft = (bucket, soft_key(src))
        hits = by_soft.get(soft) or []
        if len(hits) == 1:
            apply_fields(export["documents"][hits[0]], src)
            updated += 1
            continue
        export["documents"].append(
            {
                "order_number": src["order_number"],
                "order_date": src["order_date"],
                "appendix_number": src["appendix_number"],
                "subject_id": src["subject_id"],
                "subject_name": src.get("subject_name") or src["subject_id"],
                "language": src["language"],
                "target_grades": src["target_grades"],
                "direction": src["direction"],
                "legal_basis": src.get("legal_basis") or "",
                "goal_text": src.get("goal_text") or "",
                "tasks": src.get("tasks") or [],
                "hours": src.get("hours") or [],
                "objectives": src.get("objectives") or [],
                "quarters": src.get("quarters") or [],
            }
        )
        added += 1

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    src_note = "Materials/399 приказ 2026-2027 — полный каталог ТУП 2026-2027, ЕМН как программа по умолчанию"
    for export, path in ((ru, SEED_RU), (kz, SEED_KZ)):
        export["generated_at"] = now
        export["source"] = src_note
        export["total_documents"] = len(export["documents"])
        export["total_objectives"] = sum(len(d.get("objectives") or []) for d in export["documents"])
        path.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"seed: updated={updated} added={added} ru={len(ru['documents'])} kz={len(kz['documents'])}")


def backup_db() -> None:
    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    bak = Path(str(DB) + f".bak.{ts}")
    shutil.copyfile(DB, bak)
    print(f"db backup: {bak}")


def upsert_db_doc(cur, src: dict) -> None:
    row = cur.execute(
        """
        SELECT id FROM tup_documents
        WHERE subject_id=? AND target_grades=? AND direction=? AND language=? AND appendix_number=?
        """,
        (src["subject_id"], src["target_grades"], src["direction"], src["language"], src["appendix_number"]),
    ).fetchone()
    if not row:
        row = cur.execute(
            """
            SELECT id FROM tup_documents
            WHERE subject_id=? AND target_grades=? AND language=? AND appendix_number=?
            """,
            (src["subject_id"], src["target_grades"], src["language"], src["appendix_number"]),
        ).fetchone()
    if not row:
        row = cur.execute(
            """
            SELECT id FROM tup_documents
            WHERE subject_id=? AND target_grades=? AND direction=? AND language=?
            """,
            (src["subject_id"], src["target_grades"], src["direction"], src["language"]),
        ).fetchone()
    if row:
        doc_id = row[0]
        cur.execute(
            """
            UPDATE tup_documents
            SET order_number=?, order_date=?, appendix_number=?, direction=?, legal_basis=?, goal_text=?
            WHERE id=?
            """,
            (
                src["order_number"],
                src["order_date"],
                src["appendix_number"],
                src["direction"],
                src.get("legal_basis") or "",
                src.get("goal_text") or "",
                doc_id,
            ),
        )
    else:
        doc_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO tup_documents
            (id, order_number, order_date, appendix_number, subject_id, language, target_grades, direction, legal_basis, goal_text)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
            (
                doc_id,
                src["order_number"],
                src["order_date"],
                src["appendix_number"],
                src["subject_id"],
                src["language"],
                src["target_grades"],
                src["direction"],
                src.get("legal_basis") or "",
                src.get("goal_text") or "",
            ),
        )

    if src.get("tasks"):
        cur.execute("DELETE FROM tup_document_tasks WHERE document_id=?", (doc_id,))
        for i, text in enumerate(src["tasks"]):
            cur.execute(
                "INSERT INTO tup_document_tasks (id, document_id, order_index, task_text) VALUES (?,?,?,?)",
                (str(uuid.uuid4()), doc_id, i, text),
            )

    if src.get("hours"):
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
        for r in cur.execute("SELECT id, code FROM learning_objectives WHERE document_id=?", (doc_id,))
    }
    for o in src.get("objectives") or []:
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

    if src.get("quarters"):
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


def apply_to_db(parsed: list[dict]) -> None:
    conn = sqlite3.connect(str(DB))
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()
    for src in parsed:
        if len(src.get("objectives") or []) == 0 and len(src.get("hours") or []) == 0:
            continue
        upsert_db_doc(cur, src)
    conn.commit()
    try:
        cur.execute("INSERT INTO tup_fts(tup_fts) VALUES('rebuild')")
        conn.commit()
        print("FTS rebuilt")
    except sqlite3.Error as e:
        print(f"FTS rebuild skipped: {e}")
    n = cur.execute("SELECT COUNT(*) FROM tup_documents").fetchone()[0]
    print(f"db documents now: {n}")
    conn.close()


def main():
    parsed = json.loads(PARSED.read_text(encoding="utf-8"))
    print(f"parsed docs: {len(parsed)}")
    apply_to_seed(parsed)
    backup_db()
    apply_to_db(parsed)


if __name__ == "__main__":
    main()

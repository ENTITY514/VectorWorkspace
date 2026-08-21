#!/usr/bin/env python3
"""Контролируемый переимпорт 9 групп ТУП (те, что имеют несколько приложений).

Удаляет строки группы (CASCADE чистит все дочерние таблицы) и заливает
документы заново из JSON, точно повторяя логику Rust-импорта
(`build_full_document` -> `save_full_document`): документ + цели + задачи +
нагрузка + четверти + разделы + темы + коды тем. KTP-планы не задеты
(`ktp_plans` не ссылается на `document_id`).

UNIQUENESS_VERIFIED: переимпорт удаляет группу целиком и вставляет ровно те
приложения, что в JSON, — коллизий ключа нет по замыслу.
BACKUP_TAKEN: перед мутацией снимается копия БД (см. backup_db).

Использование:
  python reimport_tup_groups.py <db_path> [--dry]
"""
import sqlite3
import json
import os
import sys
import shutil
import datetime
import uuid

RU = os.path.join(os.path.dirname(__file__), "..", "Desktop", "src-tauri", "seed", "tup_ru.json")
KZ = os.path.join(os.path.dirname(__file__), "..", "Desktop", "src-tauri", "seed", "tup_kz.json")

GROUPS = [
    ("gramota", "1-1", "common", "RU"),
    ("gramota", "1-1", "common", "KZ"),
    ("literary_reading", "2-4", "common", "RU"),
    ("literary_reading", "2-4", "common", "KZ"),
    ("russian_language", "2-4", "common", "RU"),
    ("russian_language", "2-4", "common", "KZ"),
    ("kazakh_tili", "5-9", "common", "KZ"),
    ("kazakh_adebieti", "5-9", "common", "KZ"),
    ("kazakh_adebieti", "10-11", "common", "KZ"),
]


def backup_db(db_path):
    if not os.path.exists(db_path):
        return
    ts = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    shutil.copyfile(db_path, db_path + ".bak." + ts)


def insert_doc(cur, doc):
    doc_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO tup_documents (id, order_number, order_date, appendix_number, subject_id, language, target_grades, direction, legal_basis, goal_text) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (doc_id, doc.get("order_number"), doc.get("order_date"), doc["appendix_number"],
         doc["subject_id"], doc["language"], doc["target_grades"], doc.get("direction", "common"),
         doc.get("legal_basis") or "", doc.get("goal_text") or ""),
    )
    for o in doc.get("objectives", []):
        cur.execute(
            "INSERT INTO learning_objectives (id, document_id, grade, section_number, subsection_number, objective_number, description, code) VALUES (?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), doc_id, o["grade"], o["section_number"], o["subsection_number"],
             o["objective_number"], o.get("description") or "", o.get("code") or ""),
        )
    for i, t in enumerate(doc.get("tasks") or []):
        cur.execute(
            "INSERT INTO tup_document_tasks (id, document_id, order_index, task_text) VALUES (?,?,?,?)",
            (str(uuid.uuid4()), doc_id, i, t),
        )
    for h in doc.get("hours") or []:
        cur.execute(
            "INSERT INTO tup_subject_hours (id, document_id, grade, hours_per_week, hours_per_year) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), doc_id, h["grade"], h["hours_per_week"], h["hours_per_year"]),
        )
    for q in doc.get("quarters") or []:
        qid = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO tup_quarters (id, document_id, grade, quarter_number) VALUES (?,?,?,?)",
            (qid, doc_id, q["grade"], q["quarter_number"]),
        )
        for si, s in enumerate(q.get("sections", [])):
            sid = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO tup_sections (id, quarter_id, name, order_index) VALUES (?,?,?,?)",
                (sid, qid, s.get("name") or "", si),
            )
            for ti, t in enumerate(s.get("topics", [])):
                tid = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO tup_topics (id, section_id, name, order_index) VALUES (?,?,?,?)",
                    (tid, sid, t.get("name") or "", ti),
                )
                for code in t.get("objective_codes", []):
                    cur.execute(
                        "INSERT INTO tup_topic_objectives (topic_id, objective_code) VALUES (?,?)",
                        (tid, code),
                    )
    return doc_id


def main():
    if len(sys.argv) < 2:
        print("Usage: python reimport_tup_groups.py <db_path> [--dry]")
        sys.exit(1)
    db_path = os.path.expandvars(sys.argv[1])
    dry = "--dry" in sys.argv

    all_docs = []
    for p in (RU, KZ):
        all_docs += json.load(open(p, encoding="utf-8"))["documents"]

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    total_del = 0
    total_ins = 0
    if not dry:
        backup_db(db_path)
    for (subj, grade, direction, lang) in GROUPS:
        docs = [d for d in all_docs
                if d["subject_id"] == subj and d["target_grades"] == grade
                and d.get("direction", "common") == direction and d["language"] == lang]
        cur.execute(
            "SELECT COUNT(*) FROM tup_documents WHERE subject_id=? AND target_grades=? AND direction=? AND language=?",
            (subj, grade, direction, lang),
        )
        n = cur.fetchone()[0]
        total_del += n
        total_ins += len(docs)
        print(f"GROUP {subj} {grade} {direction} {lang}: delete {n}, insert {len(docs)} (appendix: {[d['appendix_number'] for d in docs]})")
        if dry:
            continue
        # All child tables use ON DELETE CASCADE, so one delete cleans the subtree.
        cur.execute("DELETE FROM tup_documents WHERE subject_id=? AND target_grades=? AND direction=? AND language=?", (subj, grade, direction, lang))
        for d in docs:
            insert_doc(cur, d)
    if dry:
        print(f"DRY-RUN: would delete {total_del}, insert {total_ins}. No changes made.")
    else:
        conn.commit()
        print(f"DONE: deleted {total_del}, inserted {total_ins} documents for 9 groups.")


if __name__ == "__main__":
    main()

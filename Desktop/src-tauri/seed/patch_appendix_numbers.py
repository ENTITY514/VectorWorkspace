import sqlite3
import json
import os
import sys
import shutil
import datetime


def backup_db(db_path):
    """Точка возврата: копируем БД в vector.db.bak.<timestamp> до мутации."""
    if not os.path.exists(db_path):
        return
    ts = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    shutil.copyfile(db_path, db_path + ".bak." + ts)

# Безопасное обновление appendix_number в базе данных.
#
# ВНИМАНИЕ (урок исправления): наивный UPDATE по ключу
# (subject_id, target_grades, direction, language) НЕБЕЗОПАСЕН — у одного
# предмета/класса бывает несколько приложений ТУП (разные appendix_number),
# и такой UPDATE схлопывает их в одно значение, уничтожая данные.
#
# Поэтому здесь используется устойчивая сигнатура: отсортированный набор
# кодов целей документа (learning_objectives.code). Документ БД обновляется
# ТОЛЬКО если его сигнатура однозначно совпадает ровно с одним документом JSON.
# Неоднозначные (ambiguous) строки пропускаются — скрипт никогда не перезаписывает
# вслепую. Для групп с несколькими приложениями, которые не различаются по целям,
# используйте контролируемый переимпорт (reimport_tup / reimport_groups.py).
#
# Использование:
# python patch_appendix_numbers.py <ru_json> <kz_json> <db_path>
#
# UNIQUENESS_VERIFIED: обновление производится ТОЛЬКО при однозначном
# совпадении сигнатуры кодов целей документа БД и JSON (см. update_db).
# BACKUP_TAKEN: перед мутацией снимается копия БД (см. backup_db).

def _sig(objs):
    return tuple(sorted(str(o.get("code") or o.get("id")) for o in (objs or [])))


def build_json_index(json_files):
    """(subject, grade, direction, lang) -> [(sig, appendix_number), ...]"""
    idx = {}
    for path in json_files:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for doc in data.get("documents", []):
            key = (
                doc["subject_id"],
                doc["target_grades"],
                doc.get("direction", "common"),
                doc["language"],
            )
            idx.setdefault(key, []).append((_sig(doc.get("objectives")), doc["appendix_number"]))
    return idx


def update_db(json_files, cur):
    jidx = build_json_index(json_files)
    cur.execute("SELECT id, subject_id, target_grades, direction, language FROM tup_documents")
    rows = cur.fetchall()

    updated = 0
    skipped = 0
    for doc_id, subj, grade, direction, lang in rows:
        cur.execute("SELECT code FROM learning_objectives WHERE document_id=?", (doc_id,))
        sig = tuple(sorted(r[0] for r in cur.fetchall()))
        cands = jidx.get((subj, grade, direction, lang), [])
        matches = [appx for s, appx in cands if s == sig]
        if len(matches) == 1:
            cur.execute("UPDATE tup_documents SET appendix_number=? WHERE id=?", (matches[0], doc_id))
            updated += 1
        else:
            skipped += 1
    return updated, skipped


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python patch_appendix_numbers.py <ru_json> <kz_json> <db_path>")
        sys.exit(1)

    ru_json = sys.argv[1]
    kz_json = sys.argv[2]
    db_path = os.path.expandvars(sys.argv[3])

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    backup_db(db_path)
    print(f"Обновление БД: {db_path}...")
    updated, skipped = update_db([ru_json, kz_json], cur)
    conn.commit()
    conn.close()
    print(f"Готово. Обновлено: {updated}. Пропущено (неоднозначно/нет совпадения): {skipped}.")

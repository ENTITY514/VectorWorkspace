r"""
Парсер legacy расписаний: Materials/Таблицы расписаний/*.xls -> data/synthetic/*.json
Запуск: python -m solver.tools.import_legacy_schedule --materials Materials/Таблицы_расписаний --out data/synthetic
"""
import argparse
import pathlib
import re
import json
import collections
from typing import Dict, List, Tuple

import xlrd

from solver.tools.subject_synonyms import normalize_subject
from solver.tools.room_inference import infer_room_type, room_capacity_for_type


def parse_class_cell(raw: str):
    # raw like 'Класс: 1-а' or 'Класс: 5-б ДО' or 'Класс: 1-6' (range -> treat as group)
    s = raw.strip()
    m = re.search(r'Класс:\s*(.+)', s, re.IGNORECASE)
    if not m:
        return None
    val = m.group(1).strip()
    # detect type suffix
    type_ = "normal"
    if "ДО" in val.upper():
        type_ = "do"
        val = val.upper().replace("ДО", "").strip()
    elif "ЛУО" in val.upper():
        type_ = "luo"
        val = val.upper().replace("ЛУО", "").strip()
    # val может быть '1-а' или '1-6' (диапазон) — для диапазона берём как есть, но grade будет 1, letter "1-6"? Для простоты считаем grade=1, letter=val
    # попробуем распарсить grade и letter
    # формат обычно '1-а', '5-б', '10-а'
    m2 = re.match(r'(\d+)\s*[-–]\s*([A-Za-zА-Яа-я]+)', val)
    if m2:
        grade = int(m2.group(1))
        letter = m2.group(2).strip()
    else:
        # fallback: если просто '1-6' — считаем grade 1, letter "1-6"
        grade = 1
        letter = val
        # попробовать извлечь число
        m3 = re.search(r'(\d+)', val)
        if m3:
            grade = int(m3.group(1))
    class_id = f"{grade}{letter}".lower().replace(" ", "").replace("-", "")
    if type_ != "normal":
        class_id += f"_{type_}"
    display = val.strip()
    return {"class_id": class_id, "grade": grade, "letter": letter, "type": type_, "display": display, "raw": raw}

def parse_quarter_cell(raw: str):
    m = re.search(r'(\d)\s*четверть', raw, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # fallback search digit
    m2 = re.search(r'([1-4])', raw)
    if m2:
        return int(m2.group(1))
    return 1

def normalize_teacher(raw: str):
    s = raw.strip()
    # take first line if multiline (some cells have teacher on second line, we already split)
    # raw here is already second line, like 'Квашнина Е.В.'
    s = re.sub(r'\s+', ' ', s).strip()
    if not s:
        return None
    # slug for id: lower, replace space with _, keep cyrillic, remove dots
    slug = s.lower().replace(".", "").replace(" ", "_")
    # убрать двойные _
    slug = re.sub(r'_+', '_', slug)
    return {"id": slug, "display_name": s, "raw": raw}

def parse_sheet_weekly_template(sheet):
    # Новый подход: не полагаться на заголовки недель (они бывают в той же строке что и период)
    # Собираем все строки где col1 = период 1..7 (любая неделя)
    all_slots_raw = []  # list of (day, period, subject_raw, teacher_raw, room_raw)
    for r in range(sheet.nrows):
        try:
            c1 = sheet.cell_value(r, 1)
            if isinstance(c1, (int, float)):
                if not (1 <= int(c1) <= 7):
                    continue
                period = int(c1) - 1
            elif isinstance(c1, str) and c1.strip().isdigit():
                if not (1 <= int(c1.strip()) <= 7):
                    continue
                period = int(c1.strip()) - 1
            else:
                continue
        except:
            continue
        for col in range(2, 7):  # C-G = пн-пт (5 дней)
            day = col - 2
            cell_val = sheet.cell_value(r, col)
            if not cell_val or str(cell_val).strip() == "":
                continue
            lines = [l.strip() for l in str(cell_val).split("\n") if l.strip() != ""]
            if not lines:
                continue
            subject_raw = lines[0] if len(lines) >= 1 else ""
            teacher_raw = lines[1] if len(lines) >= 2 else ""
            room_raw = lines[3] if len(lines) >= 4 else ""
            if room_raw == "" and len(lines) == 3 and ("класс" in lines[2].lower() or "зал" in lines[2].lower()):
                room_raw = lines[2]
            if len(lines) >= 5 and not room_raw:
                room_raw = lines[4]
            # пропускаем ячейки где subject похож на дату (напр. "1 сент.") — уже отфильтровано по period
            if subject_raw and re.match(r'^\d+\s*(сент|окт|ноя|дек|янв|фев|мар|апр|мая|июня|июля|авг)', subject_raw.lower()):
                continue
            all_slots_raw.append((day, period, subject_raw, teacher_raw, room_raw))
    if not all_slots_raw:
        return []
    # Группируем по (day,period) и выбираем самый частый (мажоритарный) вариант
    # Это даёт недельный шаблон даже если 8 недель с вариациями
    from collections import Counter, defaultdict
    grouped: Dict[Tuple[int,int], List[Tuple[str,str,str]]] = defaultdict(list)
    for day, period, s, t, r_ in all_slots_raw:
        grouped[(day, period)].append((s, t, r_))
    weekly = []
    for (day, period), lst in grouped.items():
        # самый частый
        most, _ = Counter(lst).most_common(1)[0]
        s, t, r_ = most
        # пропускаем если subject пустой
        if not s.strip():
            continue
        weekly.append((day, period, s, t, r_))
    # если вдруг все ячейки пустые кроме одной недели, weekly уже 5x7
    return weekly

def scan_materials(materials_path: pathlib.Path):
    files = list(materials_path.glob("*.xls"))
    # фильтр: игнорируем ~lock
    files = [f for f in files if not f.name.startswith("~")]
    results = []  # per file: {file, class_info, quarter, slots}
    for f in files:
        try:
            book = xlrd.open_workbook(str(f))
            sheet = book.sheet_by_index(0)
            # class из (0,0)
            class_raw = str(sheet.cell_value(0, 0))
            quarter_raw = str(sheet.cell_value(1, 0))
            class_info = parse_class_cell(class_raw)
            if not class_info:
                # попробуем найти в других ячейках первую строку с Класс:
                for r in range(min(3, sheet.nrows)):
                    for c in range(sheet.ncols):
                        v = str(sheet.cell_value(r, c))
                        if "Класс" in v:
                            class_info = parse_class_cell(v)
                            if class_info:
                                break
                    if class_info:
                        break
            if not class_info:
                continue
            quarter = parse_quarter_cell(quarter_raw)
            weekly = parse_sheet_weekly_template(sheet)
            results.append({"file": f.name, "class_info": class_info, "quarter": quarter, "slots": weekly, "path": str(f)})
        except Exception as e:
            print(f"WARN {f.name}: {e}")
    return results

def build_catalog_and_curriculum(results):
    # дедупликация по (class_id, quarter): выбрать файл с макс слотами
    by_key: Dict[Tuple[str,int], dict] = {}
    for r in results:
        key = (r["class_info"]["class_id"], r["quarter"])
        cur = by_key.get(key)
        if cur is None or len(r["slots"]) > len(cur["slots"]):
            by_key[key] = r
    # уникальные каталоги
    teachers: Dict[str, dict] = {}
    rooms: Dict[str, dict] = {}
    subjects: Dict[str, dict] = {}
    classes: Dict[str, dict] = {}
    # curriculum per quarter: dict quarter -> list of entries (class_id, subject_id, teacher_id, hours)
    curriculum_by_q: Dict[int, List[dict]] = {1:[],2:[],3:[],4:[]}
    # schedule_legacy per quarter: list of slots
    legacy_by_q: Dict[int, List[dict]] = {1:[],2:[],3:[],4:[]}
    # для подсчёта часов: по недельного шаблона, hours_per_week = count per subject per teacher per class
    # Но curriculum в нашей модели — это часы в неделю на класс-предмет-учителя
    # Поэтому для каждой недели считаем per (class, subject, teacher) count
    # А также собираем room для каждого слота
    for (class_id, quarter), rec in by_key.items():
        ci = rec["class_info"]
        # класс
        if class_id not in classes:
            classes[class_id] = {"id": class_id, "grade": ci["grade"], "letter": ci["letter"], "type": ci["type"], "display": ci["display"], "headcount": 25, "shift": "First"}
        slots = rec["slots"]
        # для каждой четверти собираем legacy слоты
        for day, period, subject_raw, teacher_raw, room_raw in slots:
            subj_id, subj_name, subj_weight, subj_room_type = normalize_subject(subject_raw)
            # subject catalog
            if subj_id not in subjects:
                subjects[subj_id] = {"id": subj_id, "name": subj_name, "sanitary_weight": subj_weight, "required_room_type": subj_room_type, "requires_split": False, "is_double_allowed": False, "related_subjects_json": "[]"}
            else:
                # если вес уже есть, keep
                pass
            # teacher
            tinfo = normalize_teacher(teacher_raw)
            if tinfo:
                tid = tinfo["id"]
                if tid not in teachers:
                    teachers[tid] = {"id": tid, "display_name": tinfo["display_name"], "full_name": tinfo["display_name"], "base_room_id": None, "max_daily_lessons": 0, "availability_json": json.dumps([[True]*8 for _ in range(6)], ensure_ascii=False)}
            else:
                tid = "unknown"
                if tid not in teachers:
                    teachers[tid] = {"id": tid, "display_name": "Неизвестен", "full_name": "Неизвестен", "base_room_id": None, "max_daily_lessons": 0, "availability_json": json.dumps([[True]*8 for _ in range(6)], ensure_ascii=False)}
            # room
            room_type = infer_room_type(room_raw)
            # room id: slug from room_raw or type+counter
            # deduplicate by room_type+raw lower
            room_key = room_raw.strip().lower()[:30] if room_raw.strip() else f"auto_{room_type}"
            if room_key not in rooms:
                # generate name
                name = room_raw.strip()[:40] if room_raw.strip() else f"Каб. {room_type}-{len(rooms)+1}"
                rid = f"r_{len(rooms)+1}_{room_type.lower()}"
                # deduplicate by rid? Use room_key as key but store with rid
                rooms[room_key] = {"id": rid, "name": name, "room_type": room_type, "capacity": room_capacity_for_type(room_type), "base_teacher_id": None, "floor": None, "key": room_key}
            rid = rooms[room_key]["id"]
            # legacy slot
            legacy_by_q[quarter].append({"class_id": class_id, "subject_id": subj_id, "teacher_id": tid, "room_id": rid, "day": day, "period": period, "quarter": quarter, "class_type": ci["type"]})
    # теперь curriculum: для каждой четверти агрегировать часы
    for quarter, slots in legacy_by_q.items():
        # группировка по (class_id, subject_id, teacher_id)
        counter = collections.Counter()
        for s in slots:
            key = (s["class_id"], s["subject_id"], s["teacher_id"])
            counter[key] += 1
        for (class_id, subject_id, teacher_id), hours in counter.items():
            # hours_per_week = count (since недельный шаблон)
            # split detection: если в одном слоте два учителя? пока not
            curriculum_by_q[quarter].append({"class_id": class_id, "subject_id": subject_id, "teacher_id": teacher_id, "split_teacher2_id": None, "hours_per_week": hours})
    # обеспечить пул спецкабинетов и General: рассчитать макс одновременных занятий по каждому типу
    # считаем по legacy slots
    from collections import defaultdict
    max_concurrent = defaultdict(int)
    # для каждого квартала считаем per (day,period) -> count per room_type
    for q, slots in legacy_by_q.items():
        per_slot = defaultdict(lambda: defaultdict(int))
        for s in slots:
            subj = subjects.get(s["subject_id"])
            rt = subj["required_room_type"] if subj and subj.get("required_room_type") else "General"
            per_slot[(s["day"], s["period"])][rt] += 1
        for counts in per_slot.values():
            for rt, cnt in counts.items():
                if cnt > max_concurrent[rt]:
                    max_concurrent[rt] = cnt
    # обеспечить пул
    existing_counts = collections.Counter(r["room_type"] for r in rooms.values())
    for rt, needed in max_concurrent.items():
        have = existing_counts.get(rt, 0)
        # добавить запас +2
        need = max(0, needed - have + 2)
        for i in range(need):
            rid = f"r_synth_{rt.lower()}_{have + i + 1}"
            rkey = f"synth_{rt}_{have + i + 1}"
            rooms[rkey] = {"id": rid, "name": f"Каб. {rt} {have + i + 1} (синт.)", "room_type": rt, "capacity": room_capacity_for_type(rt), "base_teacher_id": None, "floor": 1, "key": rkey, "synthetic": True}
        if rt not in existing_counts:
            existing_counts[rt] = need
    # также для всех required_room_type у предметов, даже если не встречались в legacy (напр. PhysicsLab без legacy слотов, но curriculum требует)
    needed_types = {s["required_room_type"] for s in subjects.values() if s.get("required_room_type")}
    for rt in needed_types:
        if rt not in existing_counts or existing_counts[rt] == 0:
            rid = f"r_synth_{rt.lower()}_1"
            rkey = f"synth_{rt}_1"
            if rkey not in rooms:
                rooms[rkey] = {"id": rid, "name": f"Каб. {rt} (синт.)", "room_type": rt, "capacity": room_capacity_for_type(rt), "base_teacher_id": None, "floor": 1, "key": rkey, "synthetic": True}
    # rooms dict values to list
    rooms_list = list(rooms.values())
    # cleanup rooms: remove key field
    for r in rooms_list:
        r.pop("key", None)
    # teachers list
    teachers_list = list(teachers.values())
    # subjects list
    subjects_list = list(subjects.values())
    classes_list = list(classes.values())
    return {
        "catalog": {"teachers": teachers_list, "classes": classes_list, "rooms": rooms_list, "subjects": subjects_list},
        "curriculum_by_q": curriculum_by_q,
        "legacy_by_q": legacy_by_q,
        "by_key": by_key,
    }

def main():
    parser = argparse.ArgumentParser(description="Import legacy schedule XLS -> JSON")
    parser.add_argument("--materials", type=str, default="Materials/Таблицы расписаний", help="Путь к папке с .xls")
    parser.add_argument("--out", type=str, default="data/synthetic", help="Папка для JSON")
    args = parser.parse_args()

    materials = pathlib.Path(args.materials)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Scanning {materials}...")
    results = scan_materials(materials)
    print(f"Found {len(results)} files, unique class x quarter will be deduped")
    data = build_catalog_and_curriculum(results)
    catalog = data["catalog"]
    print(f"Catalog: {len(catalog['teachers'])} teachers, {len(catalog['classes'])} classes, {len(catalog['rooms'])} rooms, {len(catalog['subjects'])} subjects")
    for q in [1,2,3,4]:
        print(f"Q{q}: {len(data['legacy_by_q'][q])} legacy slots, {len(data['curriculum_by_q'][q])} curriculum entries")

    # write catalog
    with open(out / "catalog.json", "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    for q in [1,2,3,4]:
        with open(out / f"curriculum_q{q}.json", "w", encoding="utf-8") as f:
            json.dump(data["curriculum_by_q"][q], f, ensure_ascii=False, indent=2)
        with open(out / f"schedule_legacy_q{q}.json", "w", encoding="utf-8") as f:
            json.dump(data["legacy_by_q"][q], f, ensure_ascii=False, indent=2)
    # unknown subjects log уже внутри, но дополнительно
    # also write summary
    summary = {
        "total_files": len(results),
        "unique_class_quarter": len(data["by_key"]),
        "catalog_counts": {k: len(v) for k, v in catalog.items()},
        "per_quarter": {str(q): {"legacy_slots": len(data["legacy_by_q"][q]), "curriculum": len(data["curriculum_by_q"][q])} for q in [1,2,3,4]},
    }
    with open(out / "import_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote to {out}")

if __name__ == "__main__":
    main()

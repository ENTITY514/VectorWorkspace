"""Выгрузка версии для завуча: свой порядок классов, цвета «предмет + учитель», сводка под таблицей.

  python export_review.py V8
"""
from __future__ import annotations

import colorsys
import json
import sys
from collections import defaultdict

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, GradientFill, PatternFill, Side
from openpyxl.utils import get_column_letter

from dataset import BABICH, BABICH_ROOM, DAY_LABELS, DAYS, PERIODS, build
from export_xlsx import (BORDER, FILL_DAY, FILL_FIXED, FILL_HEAD, FILL_JOINT, FILL_SPLIT, MED, WRAP, WRAP_LEFT,
                         aisana_cells, class_cells, room_label, short_name, subj, write_do_sheet, write_room_sheet,
                         write_teacher_sheet)
from import_db import COMBINED
from run_variants import OUT, XLSX_DIR

REVIEW_ORDER = ["1А", "2А", "4А", "1Б", "2Б", "3А", "4Б", "5А", "6А", "8Ә", "11А", "5Б", "6Б", "6В", "7А", "8А",
                "8Б", "AISANA", "9Б", "10А", "11Б"]
FILL_LUO_HEAD = PatternFill("solid", fgColor="E8DDF5")
FILL_SECTION = PatternFill("solid", fgColor="DDE4EE")
JOINT_SIDE = Side(style="mediumDashed", color="4A6FA5")
JOINT_BORDER = Border(left=JOINT_SIDE, right=JOINT_SIDE, top=JOINT_SIDE, bottom=JOINT_SIDE)


def pastel_palette(n: int) -> list[str]:
    out = []
    golden = 0.61803398875
    h = 0.11
    for i in range(n):
        h = (h + golden) % 1.0
        light = 0.86 if i % 2 == 0 else 0.80
        sat = 0.55 if i % 3 else 0.42
        r, g, b = colorsys.hls_to_rgb(h, light, sat)
        out.append(f"{int(r * 255):02X}{int(g * 255):02X}{int(b * 255):02X}")
    return out


def combos_of(school, res):
    """(класс, день, урок) → [(предмет, учитель)] по секциям; и множество всех сочетаний."""
    cell = defaultdict(list)
    for mi, mt in enumerate(school.meetings):
        d, p = res["slots"][str(mi)]
        for sec in mt.sections:
            for c, sub, sj in sec.attendees:
                cell[(c, d, p)].append((sj, sec.teacher))
    return cell


def availability_text(av) -> str:
    parts = []
    for d in range(DAYS):
        ps = [p + 1 for p in range(PERIODS) if av[d][p]]
        if not ps:
            continue
        if ps == list(range(1, PERIODS + 1)):
            parts.append(f"{DAY_LABELS[d]} весь день")
        else:
            rngs, start = [], ps[0]
            for a, b in zip(ps, ps[1:] + [None]):
                if b != a + 1:
                    rngs.append(f"{start}–{a}" if start != a else f"{a}")
                    start = b
            parts.append(f"{DAY_LABELS[d]} {', '.join(rngs)} ур.")
    return "; ".join(parts) if parts else "нет"


def write_review(school, res, path, title: str, colored: bool):
    wb = Workbook()
    ws = wb.active
    ws.title = "Расписание"
    cells = class_cells(school, res)
    aisana = aisana_cells(school)
    combos = combos_of(school, res)
    all_combos = sorted({cb for v in combos.values() for cb in v}, key=lambda x: (x[1], x[0]))
    palette = pastel_palette(len(all_combos))
    color_of = {cb: palette[i] for i, cb in enumerate(all_combos)}

    columns = []
    for c in REVIEW_ORDER:
        if c == "AISANA":
            columns.append((f"8Б ДО\n{short_name(school.aisana['student'])}\n(на дому, фикс.)", "AISANA"))
        elif c in school.classes:
            label = c + ("\nЛУО" if school.class_type.get(c) == "luo" else "")
            if c == "7А":
                label += "\n(+ инклюзия ЛУО)"
            columns.append((label, c))

    ncol = 2 + len(columns)
    ws.cell(1, 1, title).font = Font(bold=True, size=14)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncol)
    hr = 2
    for col, text in ((1, "День"), (2, "Урок")):
        ws.cell(hr, col, text)
    for j, (label, key) in enumerate(columns):
        ws.cell(hr, 3 + j, label)
    for col in range(1, ncol + 1):
        cell = ws.cell(hr, col)
        cell.fill = FILL_HEAD
        cell.font = Font(bold=True, size=11)
        cell.alignment = WRAP
        cell.border = BORDER
    for j, (label, key) in enumerate(columns):
        if key != "AISANA" and school.class_type.get(key) == "luo":
            ws.cell(hr, 3 + j).fill = FILL_LUO_HEAD
        if key == "AISANA":
            ws.cell(hr, 3 + j).fill = FILL_FIXED
    ws.row_dimensions[hr].height = 48

    joint_classes = {}
    for mi, mt in enumerate(school.meetings):
        if len(mt.classes) > 1:
            d, p = res["slots"][str(mi)]
            for c in mt.classes:
                joint_classes[(c, d, p)] = True

    row = hr + 1
    for d in range(DAYS):
        start = row
        for p in range(PERIODS):
            ws.cell(row, 2, p + 1).alignment = WRAP
            ws.cell(row, 2).fill = FILL_DAY
            ws.cell(row, 2).border = BORDER
            for j, (_, key) in enumerate(columns):
                cell = ws.cell(row, 3 + j)
                cell.alignment = WRAP
                cell.border = BORDER
                cell.font = Font(size=9)
                if key == "AISANA":
                    v = aisana.get((d, p))
                    if v:
                        cell.value = v[0]
                        cell.fill = FILL_FIXED
                    continue
                v = cells.get((key, d, p))
                if not v:
                    continue
                cell.value = v[0]
                if colored:
                    cbs = list(dict.fromkeys(combos[(key, d, p)]))
                    cols = [color_of[cb] for cb in cbs]
                    if len(cols) == 1:
                        cell.fill = PatternFill("solid", fgColor=cols[0])
                    else:
                        cell.fill = GradientFill(type="linear", degree=0, stop=(cols[0], cols[1]))
                    if joint_classes.get((key, d, p)):
                        cell.border = JOINT_BORDER
                        cell.font = Font(size=9, italic=True)
                elif v[1]:
                    cell.fill = v[1]
            ws.row_dimensions[row].height = 58
            row += 1
        ws.merge_cells(start_row=start, start_column=1, end_row=row - 1, end_column=1)
        dc = ws.cell(start, 1, DAY_LABELS[d])
        dc.alignment = Alignment(text_rotation=90, vertical="center", horizontal="center")
        dc.font = Font(bold=True, size=14)
        dc.fill = FILL_DAY
        for col in range(1, ncol + 1):
            c_ = ws.cell(row - 1, col)
            c_.border = Border(left=c_.border.left, right=c_.border.right, top=c_.border.top, bottom=MED)
    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 5
    for j in range(len(columns)):
        ws.column_dimensions[get_column_letter(3 + j)].width = 21
    ws.freeze_panes = ws.cell(hr + 1, 3)

    row = write_stats(ws, school, res, row + 2, colored, color_of)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    write_teacher_sheet(wb, school, res)
    write_room_sheet(wb, school, res)
    write_do_sheet(wb)
    wb.save(path)


def section(ws, row, text):
    c = ws.cell(row, 3, text)
    c.font = Font(bold=True, size=13)
    for col in range(3, 3 + 10):
        ws.cell(row, col).fill = FILL_SECTION
    return row + 1


def put(ws, row, values, bold=False, height=None, fills=None):
    for j, v in enumerate(values):
        cell = ws.cell(row, 3 + j, v)
        cell.alignment = WRAP_LEFT
        cell.border = BORDER
        cell.font = Font(size=9, bold=bold)
        if fills and j in fills and fills[j]:
            cell.fill = fills[j]
    if height:
        ws.row_dimensions[row].height = height
    return row + 1


def write_stats(ws, school, res, row, colored, color_of):
    s = school
    m = res["metrics"]
    # занятость учителей
    busy = defaultdict(lambda: defaultdict(list))
    for mi, mt in enumerate(s.meetings):
        d, p = res["slots"][str(mi)]
        for si, sec in enumerate(mt.sections):
            cls = ",".join(sorted({a[0] + (f"/{a[1]}" if a[1] else "") for a in sec.attendees}))
            busy[sec.teacher][d].append((p, f"{p + 1} ур. {cls} {subj(sorted(sec.subjects)[0])}"))

    def windows_of(t):
        out = []
        for d in range(DAYS):
            ps = sorted(p for p, _ in busy[t][d])
            if ps:
                out += [f"{DAY_LABELS[d]} {g + 1}" for g in range(ps[0], ps[-1])
                        if g not in ps and s.availability[t][d][g]]
        return out

    row = section(ws, row, "Сводка для завуча")
    row = put(ws, row, [f"Версия: {res['profile']['name']} — {res['profile']['title']}"], bold=True)
    row = put(ws, row, [
        f"Жёсткие правила: {'нарушений нет' if not res['hard_violations'] else len(res['hard_violations'])}.  "
        f"Окон у учителей всего: {m['teacher_windows_total']}.  Классы начинают не с 1-го урока: "
        f"{m['late_starts']}.  8-х уроков: {m['eighth_lessons']}."])
    row += 1

    if colored:
        row = section(ws, row, "Цвета: предмет — учитель")
        by_teacher = defaultdict(list)
        for (sj, t), col in color_of.items():
            by_teacher[t].append((sj, col))
        items = [(t, sj, col) for t in sorted(by_teacher) for sj, col in sorted(by_teacher[t])]
        per_row = 4
        for i in range(0, len(items), per_row):
            vals, fills = [], {}
            for k, (t, sj, col) in enumerate(items[i:i + per_row]):
                vals += [f"{short_name(t)} — {subj(sj)}", ""]
                fills[2 * k] = PatternFill("solid", fgColor=col)
            row = put(ws, row, vals, fills=fills, height=24)
        row = put(ws, row, ["Пунктирная синяя рамка и курсив — совмещённый урок (класс-комплект). Две краски в "
                            "ячейке — деление на подгруппы. Сиреневый заголовок — ЛУО. Фиолетовая колонка — ДО."])
        row += 1

    row = section(ws, row, "Учителя: нагрузка и окна")
    row = put(ws, row, ["Учитель", "Уроков", "Окон", "Где окна", "Совместитель", "Когда может работать",
                        "Уроков по дням (Пн–Пт)"], bold=True)
    for t in sorted(s.teachers):
        n = sum(len(v) for v in busy[t].values())
        w = windows_of(t)
        full = all(all(r) for r in s.availability[t])
        row = put(ws, row, [
            t, n, len(w), ", ".join(w) or "—", "да" if t in COMBINED else "",
            "без ограничений" if full else availability_text(s.availability[t]),
            " / ".join(str(len(busy[t][d])) for d in range(DAYS))],
            fills={2: PatternFill("solid", fgColor="FDE2E1")} if w else None)
    row += 1

    row = section(ws, row, "Совместители: когда могут и что стоит")
    row = put(ws, row, ["Учитель", "Когда может работать", "Расписание", "Окон"], bold=True)
    for t in sorted(COMBINED):
        if t not in s.teachers:
            continue
        sched = "\n".join(f"{DAY_LABELS[d]}: " + "; ".join(txt for _, txt in sorted(busy[t][d]))
                          for d in range(DAYS) if busy[t][d])
        row = put(ws, row, [t, availability_text(s.availability[t]), sched, len(windows_of(t))],
                  height=15 * max(2, sched.count("\n") + 2))
    row += 1

    row = section(ws, row, "Классы: уроков по дням")
    row = put(ws, row, ["Класс", "Пн", "Вт", "Ср", "Чт", "Пт", "Всего", "Примечание"], bold=True)
    class_ps = defaultdict(lambda: defaultdict(set))
    for mi, mt in enumerate(s.meetings):
        d, p = res["slots"][str(mi)]
        for c in mt.classes:
            class_ps[c][d].add(p)
    for c in [c for c in REVIEW_ORDER if c in s.classes]:
        vals = []
        notes = []
        for d in range(DAYS):
            ps = sorted(class_ps[c][d])
            vals.append(f"{len(ps)} ({ps[0] + 1}–{ps[-1] + 1})" if ps else "—")
            if ps and ps[0] > 0:
                notes.append(f"{DAY_LABELS[d]} с {ps[0] + 1}-го урока")
            if ps and ps[-1] == 7:
                notes.append(f"{DAY_LABELS[d]} 8-й урок")
        if s.class_type.get(c) == "luo":
            notes.append("ЛУО, не позже 6-го урока, совмещён с 6Б")
        row = put(ws, row, [c] + vals + [sum(len(class_ps[c][d]) for d in range(DAYS)), "; ".join(notes)])
    row += 1

    row = section(ws, row, "Кабинеты и особые случаи")
    lines = [
        ("Совмещённые уроки (класс-комплекты)", "2А+4А: музыка, ИЗО, труд, физкультура; 5А+6А: музыка, худ. труд "
                                                "(1 ч — вместе с 8Ә); 6Б+6В: русский, математика, естествознание, "
                                                "музыка, литература/чтение, ИЗО/худ. труд, физкультура"),
        ("Подгруппы", "Худ. труд — девочки/мальчики (5Б, 6Б, 7А, 8А, 8Б); казахский 6Б/9Б — 2 группы; "
                      "6Б/9Б — английский 1Г/2Г и информатика перекрёстно"),
        ("ЛУО / ДО", "6В (ЛУО) — отдельная колонка, совмещён с 6Б. Власова (ЛУО) ходит на уроки 7А. "
                     "Тургумбаева Айсана (8Б ДО) — фиксированные 2–3 уроки на дому."),
        ("Совместители в кабинетах", "Балташева (химия) и Аятова (физика) — профильный кабинет, если свободен, иначе "
                                     "любой свободный; их 2 урока у класса в день стоят подряд."),
        ("Физкультура", "Большие классы — спортзал (№01), маленькие (до 8 детей) — малый зал."),
        ("Не включено", "Факультативы/вариатив, остальные ученики ДО и ООП/ЗПР."),
    ]
    for k, v in lines:
        row = put(ws, row, [k, v], height=15 * max(1, v.count("\n") + 1, len(v) // 90 + 1))
    ws.column_dimensions[get_column_letter(3)].width = 30
    return row


def main(name: str):
    school = build()
    res = json.loads((OUT / f"{name}.json").read_text(encoding="utf-8"))
    prof = res["profile"]
    base = f"Расписание 2026–2027 · {prof['name']} — {prof['title']}"
    XLSX_DIR.mkdir(parents=True, exist_ok=True)
    p1 = XLSX_DIR / f"Расписание_{name}_для_завуча.xlsx"
    p2 = XLSX_DIR / f"Расписание_{name}_для_завуча_цветное.xlsx"
    write_review(school, res, p1, base, colored=False)
    write_review(school, res, p2, base + " (цвета: предмет — учитель)", colored=True)
    print("записан", p1)
    print("записан", p2)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1] if len(sys.argv) > 1 else "V8")

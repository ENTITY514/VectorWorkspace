"""Полный балл СанПиН по model.py: отклонение кривой + штраф за позицию трудного урока."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.append(str(Path(__file__).resolve().parent))

from dataset import DAYS, DAY_LABELS, build, grade_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "bilimclass" / "output"

PRIMARY_CURVE = [8, 11, 6, 11, 8]
UPPER_CURVE = [8, 11, 9, 11, 7]
TOL = 3
LIGHT_FIRST = {"Музыка", "Изобразительное искусство", "Художественный труд",
               "Трудовое обучение"}

school = build()
names = ["V36", "V40", "V41"]
data = {n: json.load(open(OUT / f"{n}.json", encoding="utf-8")) for n in names}

print(f"{'Вариант':8}{'сумма откл. кривой':>22}{'штраф за позицию':>20}{'ИТОГО (баллы СанПиН)':>24}")
results = {}
for n in names:
    res = data[n]
    curve_dev = 0
    pos_pen = 0
    detail = {}
    for c in school.classes:
        curve = PRIMARY_CURVE if grade_of(c) <= 4 else UPPER_CURVE
        tot = sum(curve)
        factor = 2 if c == "10А" else 1
        wmeet = {}
        for mi, mt in enumerate(school.meetings):
            if c in mt.classes:
                wmeet[mi] = max(school.subject_weight[(c, sj)] for sj in mt.class_subjects(c))
        week = sum(wmeet.values())
        cls_dev = 0
        for d in range(DAYS):
            daily = 0
            for mi, w in wmeet.items():
                dd, p = res["slots"][str(mi)]
                if dd == d:
                    daily += w
            target = round(week * curve[d] / tot)
            cls_dev += max(0, abs(daily - target) - TOL)
        curve_dev += cls_dev * factor
        for mi, w in wmeet.items():
            d, p = res["slots"][str(mi)]
            cost = 0
            if w >= 7:
                f = {0: 0.1, 4: 0.4, 5: 0.8, 6: 1.2, 7: 1.6}.get(p, 0)
                if d == 4 and p >= 4:
                    f += 0.5
                cost = round(w * f)
            elif w <= 4 and p in (1, 2, 3):
                cost = 2
            if (p == 0 and grade_of(c) >= 5 and c != "10А"
                    and school.meetings[mi].class_subjects(c) & LIGHT_FIRST):
                cost += 4
            pos_pen += cost * (2 if c == "10А" else 1)
        detail[c] = None
    results[n] = (curve_dev, pos_pen, curve_dev + pos_pen)
    print(f"{n:8}{curve_dev:>22}{pos_pen:>20}{curve_dev + pos_pen:>24}")

print()
print("Разница относительно V36:")
for n in names[1:]:
    a, b = results["V36"], results[n]
    print(f"  {n}: кривая {b[0] - a[0]:+d}, позиция {b[1] - a[1]:+d}, "
          f"итого {b[2] - a[2]:+d} баллов")

# дневная кривая ключевых нагруженных классов
print()
print("Дневная взвешенная нагрузка (баллы) для классов с худшими отклонениями:")
for c in ["3А", "6Б", "11Б", "9Б", "1А", "4Б", "8А"]:
    curve = PRIMARY_CURVE if grade_of(c) <= 4 else UPPER_CURVE
    tot = sum(curve)
    wmeet = {}
    for mi, mt in enumerate(school.meetings):
        if c in mt.classes:
            wmeet[mi] = max(school.subject_weight[(c, sj)] for sj in mt.class_subjects(c))
    week = sum(wmeet.values())
    targets = [round(week * curve[d] / tot) for d in range(DAYS)]
    line = f"  {c} (нед={week}, цель={targets}): "
    for n in names:
        res = data[n]
        loads = [0] * DAYS
        for mi, w in wmeet.items():
            d, p = res["slots"][str(mi)]
            loads[d] += w
        line += f"{n}={loads}  "
    print(line)

"""Сравнение вариантов расписания: V36 / V40 / V41.

Считает по каждому варианту: окна у учителей, дневную нагрузку классов
(отклонение от кривой СанПиН), поздние старты, 8-е уроки, жёсткие нарушения,
а также сколько уроков сдвинуто между парами вариантов.

Запуск:  python compare_versions.py [V36 V40 V41]
"""
from __future__ import annotations

import io
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.append(str(Path(__file__).resolve().parent))

from dataset import DAYS, DAY_LABELS, PERIODS, build, grade_of  # noqa: E402
from verify import metrics  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "bilimclass" / "output"

PRIMARY_CURVE = [8, 11, 6, 11, 8]
UPPER_CURVE = [8, 11, 9, 11, 7]
SANPIN_TOL = 3


def load(name: str) -> dict:
    with open(OUT / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)


def sanpin_report(school, res):
    """Отклонение дневной взвешенной нагрузки класса от кривой СанПиН."""
    s = school
    bad_days = 0
    total_abs_dev = 0
    max_dev = 0
    worst = []
    by_class = {}
    for c in s.classes:
        curve = PRIMARY_CURVE if grade_of(c) <= 4 else UPPER_CURVE
        tot_curve = sum(curve)
        wmeet = {}
        for mi, mt in enumerate(s.meetings):
            if c not in mt.classes:
                continue
            wmeet[mi] = max(s.subject_weight[(c, sj)] for sj in mt.class_subjects(c))
        week = sum(wmeet.values())
        devs = []
        for d in range(DAYS):
            daily = 0
            for mi, w in wmeet.items():
                dd, p = res["slots"][str(mi)]
                if dd == d:
                    daily += w
            target = round(week * curve[d] / tot_curve)
            dev = abs(daily - target) - SANPIN_TOL
            dev = max(0, dev)
            devs.append(dev)
            total_abs_dev += dev
            max_dev = max(max_dev, dev)
            if dev:
                bad_days += 1
        by_class[c] = devs
        if any(devs):
            worst.append((sum(devs), c, devs))
    worst.sort(reverse=True)
    return {
        "bad_days": bad_days,
        "total_abs_dev": total_abs_dev,
        "max_dev": max_dev,
        "by_class": by_class,
        "worst": worst,
    }


def day_load(school, res):
    """Суммарная дневная нагрузка school-wide (число уроков по дням)."""
    per_day = [0] * DAYS
    for mi in range(len(school.meetings)):
        d, p = res["slots"][str(mi)]
        per_day[d] += 1
    return per_day


def class_day_counts(m):
    return m["class_day_counts"]


def moved(a: dict, b: dict):
    """Сколько встреч сменило (день, урок) между вариантами."""
    out = []
    for k in a["slots"]:
        if a["slots"][k] != b["slots"].get(k):
            out.append((int(k), tuple(a["slots"][k]), tuple(b["slots"][k])))
    return out


def moved_by_teacher(school, diffs):
    cnt = defaultdict(int)
    for mi, _, _ in diffs:
        mt = school.meetings[mi]
        for t in sorted(mt.teachers):
            cnt[t] += 1
    return dict(sorted(cnt.items(), key=lambda kv: -kv[1]))


def moved_by_class(school, diffs):
    cnt = defaultdict(int)
    for mi, _, _ in diffs:
        for c in school.meetings[mi].classes:
            cnt[c] += 1
    return dict(sorted(cnt.items(), key=lambda kv: -kv[1]))


def teacher_day_span(school, res):
    """Максимальная дневная продолжительность дня у учителя (для СанПиН по учителям)."""
    busy = defaultdict(set)
    for mi in range(len(school.meetings)):
        mt = school.meetings[mi]
        d, p = res["slots"][str(mi)]
        for sec in mt.sections:
            busy[(sec.teacher, d)].add(p)
    per_teacher = defaultdict(list)
    for (t, d), ps in busy.items():
        per_teacher[t].append(len(ps))
    return {t: max(v) for t, v in per_teacher.items()}


def raw_windows(school, res):
    """Окна как в логе солвера: чистые разрывы между первым и последним уроком дня
    (без учёта доступности учителя)."""
    busy = defaultdict(lambda: defaultdict(set))
    for mi in range(len(school.meetings)):
        for sec in school.meetings[mi].sections:
            d, p = res["slots"][str(mi)]
            busy[sec.teacher][d].add(p)
    out = {}
    for t, by_day in busy.items():
        total = 0
        per = []
        for d in range(DAYS):
            ps = by_day.get(d, set())
            g = len([x for x in range(min(ps), max(ps)) if x not in ps]) if ps else 0
            total += g
            per.append(g)
        out[t] = (total, per)
    return out


def main():
    names = sys.argv[1:] or ["V36", "V40", "V41"]
    school = build()
    data = {n: load(n) for n in names}

    print("=" * 78)
    print("ОБЩАЯ ИНФОРМАЦИЯ")
    print("=" * 78)
    for n, d in data.items():
        print(f"  {n}: status={d.get('status')}  objective={d.get('objective')}  "
              f"wall={d.get('wall_sec')}  slots={len(d['slots'])}  rooms={len(d['rooms'])}")
        print(f"        profile.name={d.get('profile', {}).get('name')}  "
              f"title={d.get('profile', {}).get('title')}")

    # --- метрики ---
    mets = {}
    for n, d in data.items():
        mets[n] = d.get("metrics") or metrics(school, d)

    print()
    print("=" * 78)
    print("ОКНА У УЧИТЕЛЕЙ")
    print("=" * 78)
    header = f"{'Учитель':38}" + "".join(f"{n:>8}" for n in names)
    print(header)
    teachers = sorted({t for n in names for t in mets[n]["teacher_windows"]})
    for t in teachers:
        vals = [mets[n]["teacher_windows"].get(t, 0) for n in names]
        if any(vals):
            flag = "  <-- изменилось" if len(set(vals)) > 1 else ""
            print(f"{t:38}" + "".join(f"{v:>8}" for v in vals) + flag)
    print("-" * len(header))
    print(f"{'ИТОГО':38}" + "".join(f"{mets[n]['teacher_windows_total']:>8}" for n in names))
    print(f"{'Уроков 8-х':38}" + "".join(f"{mets[n]['eighth_lessons']:>8}" for n in names))
    print(f"{'Поздние старты':38}" + "".join(f"{mets[n]['late_starts']:>8}" for n in names))

    print()
    print("СЫРЫЕ окна (разрывы без учёта доступности; так считал солвер V41):")
    raws = {n: raw_windows(school, data[n]) for n in names}
    print(header)
    r_teachers = sorted({t for n in names for t in raws[n]})
    for t in r_teachers:
        vals = [raws[n].get(t, (0, [0] * DAYS))[0] for n in names]
        if any(vals):
            flag = "  <-- изменилось" if len(set(vals)) > 1 else ""
            print(f"{t:38}" + "".join(f"{v:>8}" for v in vals) + flag)
    print("-" * len(header))
    print(f"{'ИТОГО (сырые)':38}" +
          "".join(f"{sum(v[0] for v in raws[n].values()):>8}" for n in names))

    print()
    print("СЫРЫЕ окна по дням для ключевых учителей (Пн Вт Ср Чт Пт):")
    key = ["Красноперова Ольга Викторовна", "Мельников Павел Викторович",
           "Досаева Мадина Хайрулловна", "Ильясова Алмагуль Бахтиаровна",
           "Русина Наталья Владимировна", "Пащенко Наталья Аркадьевна",
           "Кашиков Еркебулан Ермекович", "Ольков Геннадий Васильевич",
           "Власова Айгуль Каирбековна", "Бабич Иман Денисович"]
    for t in key:
        print(f"  {t}")
        for n in names:
            tot, per = raws[n].get(t, (0, [0] * DAYS))
            print(f"      {n}: всего={tot:<3} {list(zip(DAY_LABELS, per))}")

    # --- СанПиН ---
    print()
    print("=" * 78)
    print("САНПИН: дневная нагрузка классов (отклонение от кривой, штраф > 3 баллов)")
    print("=" * 78)
    sp = {n: sanpin_report(school, data[n]) for n in names}
    print(f"{'Вариант':10}{'Дней с откл.':>14}{'Сумма откл.':>14}{'Макс. откл.':>14}")
    for n in names:
        print(f"{n:10}{sp[n]['bad_days']:>14}{sp[n]['total_abs_dev']:>14}{sp[n]['max_dev']:>14}")

    print()
    print("Классы с худшей нагрузкой (сумма откл. по дням):")
    for n in names:
        top = sp[n]["worst"][:6]
        print(f"  {n}: " + ", ".join(f"{c}={tot} {devs}" for tot, c, devs in top))

    print()
    print("Суммарная дневная нагрузка school-wide (число уроков Пн..Пт):")
    for n in names:
        print(f"  {n}: {day_load(school, data[n])}")

    # --- дневные счётчики классов, изменившиеся ---
    print()
    print("=" * 78)
    print("ИЗМЕНЕНИЯ ПО ДНЯМ (число уроков класса в дне), где есть расхождения")
    print("=" * 78)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            ca, cb = class_day_counts(mets[a]), class_day_counts(mets[b])
            diffs = []
            for c in sorted(ca):
                if ca[c] != cb.get(c):
                    diffs.append((c, ca[c], cb.get(c)))
            print(f"  {a} -> {b}: классов с изменившейся дневной кривой: {len(diffs)}")
            for c, x, y in diffs:
                print(f"      {c}: {x}  ->  {y}")

    # --- сдвинутые уроки ---
    print()
    print("=" * 78)
    print("СДВИНУТЫЕ УРОКИ (изменили день/период)")
    print("=" * 78)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            diffs = moved(data[a], data[b])
            print(f"\n  {a} -> {b}: сдвинуто {len(diffs)} из {len(data[a]['slots'])} встреч")
            if not diffs:
                continue
            by_t = moved_by_teacher(school, diffs)
            by_c = moved_by_class(school, diffs)
            print("      по учителям: " + ", ".join(f"{t.split()[0]} {t.split()[1]}: {v}"
                                                   for t, v in list(by_t.items())[:15]))
            print("      по классам:  " + ", ".join(f"{c}: {v}" for c, v in by_c.items()))

    # --- жёсткие нарушения ---
    print()
    print("=" * 78)
    print("ЖЁСТКИЕ НАРУШЕНИЯ (verify, свежая проверка)")
    print("=" * 78)
    for n in names:
        hv = data[n].get("hard_violations")
        print(f"  {n}: сохранено в файле -> "
              f"{'нет ключа' if hv is None else len(hv)} нарушений")

    # --- конфликты кабинетов / учителей / классов ---
    print()
    print("=" * 78)
    print("КОНФЛИКТЫ (кабинет / учитель / класс в один слот)")
    print("=" * 78)
    for n in names:
        rooms, teach, cls = defaultdict(list), defaultdict(list), defaultdict(list)
        for mi in range(len(school.meetings)):
            d, p = data[n]["slots"][str(mi)]
            for si, sec in enumerate(school.meetings[mi].sections):
                rooms[(data[n]["rooms"].get(f"{mi}|{si}"), d, p)].append(mi)
                teach[(sec.teacher, d, p)].append(mi)
            for c in school.meetings[mi].classes:
                cls[(c, d, p)].append(mi)
        rc = {k: v for k, v in rooms.items() if k[0] and len(v) > 1}
        tc = {k: v for k, v in teach.items() if len(v) > 1}
        cc = {k: v for k, v in cls.items() if len(v) > 1}
        print(f"  {n}: кабинетов={len(rc)}  учителей={len(tc)}  классов={len(cc)}")
        for (room, d, p), mis in sorted(rc.items()):
            pretty = []
            for mi in mis:
                mt = school.meetings[mi]
                subs = sorted({sj for sec in mt.sections for sj in sec.subjects})
                pretty.append(f"{mi}({','.join(mt.classes)} {'/'.join(subs)})")
            print(f"      {room} {DAY_LABELS[d]} {p+1}: " + " vs ".join(pretty))

    print()
    print("Расслабленные (согласованные) ограничения — одинаковы у всех:")
    for line in (data[names[0]].get("relaxed_daily") or []):
        print(f"   {line}")

    # --- максимум уроков у учителя в день ---
    print()
    print("=" * 78)
    print("МАКСИМУМ УРОКОВ У УЧИТЕЛЯ В ОДИН ДЕНЬ (СанПиН по учителям: <= 6)")
    print("=" * 78)
    spans = {n: teacher_day_span(school, data[n]) for n in names}
    all_t = sorted({t for n in names for t in spans[n]})
    changed = []
    for t in all_t:
        vals = [spans[n].get(t, 0) for n in names]
        if len(set(vals)) > 1 or max(vals) >= 6:
            changed.append((t, vals))
    for t, vals in changed:
        print(f"  {t:38}" + "".join(f"{v:>6}" for v in vals) +
              ("   <-- >6 уроков в день" if max(vals) > 6 else ""))


if __name__ == "__main__":
    main()

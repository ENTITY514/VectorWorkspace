#!/usr/bin/env python3
"""Назначение базовых кабинетов учителям (кабинетная система).

Школа работает так: у части учителей есть свой кабинет, где они проводят
основную часть уроков. Учителя без кабинета («плавающие») занимают
свободные кабинеты — в том числе чужие, когда владелец не ведёт.

Зачем это нужно движку. Без закрепления почти каждый урок можно поставить
в любой из 58 кабинетов, варианты для солвера неразличимы, и перебор не
сходится. Закрепление снимает эту симметрию: урок учителя с кабинетом
однозначно привязан к месту, свободными остаются только уроки плавающих.

Правила назначения:
  1. Нагрузка считается ФИЗИЧЕСКИ: совмещённый урок (joint_lesson_id) —
     это одно занятие учителя, а не несколько.
  2. Учителю, у которого преобладают уроки со спецкабинетом (информатика,
     физкультура, лаборатории), даётся кабинет этого типа.
  3. Остальные получают общие кабинеты в порядке убывания нагрузки.
  4. Кому кабинетов не хватило — остаются плавающими. Это не ошибка:
     учителю с нагрузкой 1-4 часа свой кабинет не нужен.
  5. Один кабинет — одному учителю. Двое владельцев одного кабинета не
     смогут вести одновременно, и расписание станет невыполнимым.

Запуск:
    python tools/assign_base_rooms.py --db backup/copy.db            # показать план
    python tools/assign_base_rooms.py --db backup/copy.db --apply    # записать
"""
from __future__ import annotations

import argparse
import collections
import sqlite3
import sys
from pathlib import Path

if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def physical_load(conn: sqlite3.Connection) -> dict[str, int]:
    """Нагрузка учителя в занятиях в неделю с учётом совмещённых уроков."""
    cur = conn.cursor()
    cur.execute(
        "SELECT teacher_id, split_teacher2_id, hours_per_week, joint_lesson_id "
        "FROM schedule_curriculum"
    )
    load: collections.Counter[str] = collections.Counter()
    seen: set[tuple[str, str]] = set()
    for teacher, split2, hours, joint in cur.fetchall():
        for t in (teacher, split2):
            if not t:
                continue
            if joint:
                if (t, joint) in seen:
                    continue
                seen.add((t, joint))
            load[t] += hours
    return dict(load)


def dominant_room_type(conn: sqlite3.Connection) -> dict[str, str | None]:
    """Преобладающий тип кабинета в нагрузке учителя, либо None для общих."""
    cur = conn.cursor()
    cur.execute("SELECT id, required_room_type FROM schedule_subjects")
    required = dict(cur.fetchall())
    cur.execute(
        "SELECT teacher_id, split_teacher2_id, subject_id, hours_per_week, joint_lesson_id "
        "FROM schedule_curriculum"
    )
    by_teacher: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    seen: set[tuple[str, str]] = set()
    for teacher, split2, subject, hours, joint in cur.fetchall():
        for t in (teacher, split2):
            if not t:
                continue
            if joint:
                if (t, joint) in seen:
                    continue
                seen.add((t, joint))
            by_teacher[t][required.get(subject)] += hours

    out: dict[str, str | None] = {}
    for t, counts in by_teacher.items():
        spec = [(k, v) for k, v in counts.items() if k]
        general_hours = counts.get(None, 0)
        if spec:
            top_type, top_hours = max(spec, key=lambda kv: kv[1])
            # Спецкабинет становится базовым, только если такие уроки
            # преобладают: иначе учитель большую часть времени в общем.
            if top_hours >= general_hours:
                out[t] = top_type
                continue
        out[t] = None
    return out


def plan(conn: sqlite3.Connection) -> tuple[list[tuple[str, str, str]], list[tuple[str, int]]]:
    """Возвращает (назначения, плавающие). Назначение: (teacher, room, причина)."""
    cur = conn.cursor()
    cur.execute("SELECT id, room_type FROM schedule_rooms ORDER BY id")
    rooms_by_type: dict[str, list[str]] = collections.defaultdict(list)
    for rid, rtype in cur.fetchall():
        rooms_by_type[rtype].append(rid)

    load = physical_load(conn)
    dominant = dominant_room_type(conn)

    assignments: list[tuple[str, str, str]] = []
    taken: set[str] = set()

    # Сначала спецкабинеты: их меньше и заменить их нечем.
    spec_teachers = sorted(
        ((t, h) for t, h in load.items() if dominant.get(t)),
        key=lambda kv: -kv[1],
    )
    for teacher, _hours in spec_teachers:
        rtype = dominant[teacher]
        pool = [r for r in rooms_by_type.get(rtype, []) if r not in taken]
        if pool:
            room = pool[0]
            taken.add(room)
            assignments.append((teacher, room, rtype))

    # Затем общие кабинеты — по убыванию нагрузки.
    assigned_teachers = {t for t, _, _ in assignments}
    general_teachers = sorted(
        ((t, h) for t, h in load.items() if t not in assigned_teachers),
        key=lambda kv: -kv[1],
    )
    general_pool = [r for r in rooms_by_type.get("General", []) if r not in taken]
    floating: list[tuple[str, int]] = []
    for teacher, hours in general_teachers:
        if general_pool:
            room = general_pool.pop(0)
            taken.add(room)
            assignments.append((teacher, room, "General"))
        else:
            floating.append((teacher, hours))

    return assignments, floating


def apply(conn: sqlite3.Connection, assignments: list[tuple[str, str, str]]) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE schedule_teachers SET base_room_id = NULL")
    cur.execute("UPDATE schedule_rooms SET base_teacher_id = NULL")
    for teacher, room, _ in assignments:
        cur.execute("UPDATE schedule_teachers SET base_room_id = ? WHERE id = ?", (room, teacher))
        cur.execute("UPDATE schedule_rooms SET base_teacher_id = ? WHERE id = ?", (teacher, room))
    conn.commit()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True, help="путь к базе (используйте КОПИЮ)")
    ap.add_argument("--apply", action="store_true", help="записать изменения (иначе только план)")
    ap.add_argument("--i-know-what-i-am-doing", action="store_true",
                    help="разрешить работу с боевой базой в APPDATA")
    args = ap.parse_args()

    db = Path(args.db)
    low = str(db).lower()
    if ("appdata" in low or "com.teacher.vectorworkspace" in low) and not args.i_know_what_i_am_doing:
        print("ОТКАЗ: путь ведёт к боевой базе. Работайте с копией.", file=sys.stderr)
        return 2
    if not db.exists():
        print(f"ОТКАЗ: файл не найден: {db}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(db)
    assignments, floating = plan(conn)

    by_type: collections.Counter[str] = collections.Counter(t for _, _, t in assignments)
    load = physical_load(conn)
    print(f"База: {db}")
    print(f"Назначено кабинетов: {len(assignments)}")
    for rtype, n in sorted(by_type.items()):
        print(f"    {rtype:14} {n}")
    print(f"Плавающих учителей : {len(floating)}")
    for teacher, hours in floating:
        print(f"    {teacher[:30]:30} {hours} ч/нед — кабинет не нужен")

    print("\nНАЗНАЧЕНИЯ (по убыванию нагрузки):")
    for teacher, room, rtype in sorted(assignments, key=lambda a: -load.get(a[0], 0)):
        print(f"    {teacher[:28]:28} -> {room[:24]:24} [{rtype}] {load.get(teacher, 0)} ч")

    if args.apply:
        apply(conn, assignments)
        print("\nЗаписано.")
    else:
        print("\nЭто только план. Для записи добавьте --apply")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

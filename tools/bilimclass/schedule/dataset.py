"""Сборка задачи расписания из data/bilimclass/*.json.

Единица планирования — «урок-событие» (Meeting): всё, что происходит в одном
слоте одновременно и должно стоять вместе. Событие состоит из секций (Section):
секция = один учитель в одном кабинете со своими слушателями.

  * обычный урок                → 1 секция;
  * деление на подгруппы         → по секции на подгруппу;
  * класс-комплект               → слушатели из нескольких классов;
  * перекрёстные подгруппы 6Б/9Б → информатика одной подгруппы + английский другой.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "bilimclass"

DAYS = 5
PERIODS = 8
DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт"]

CLASS_ORDER = ["1А", "1Б", "2А", "2Б", "3А", "4А", "4Б", "5А", "5Б", "6А", "6Б", "6В",
               "7А", "8А", "8Б", "8Ә", "9Б", "10А", "11А", "11Б"]

ALGEBRA = {"Алгебра", "Алгебра и начала анализа"}
GEOMETRY = {"Геометрия"}
MATH = ALGEBRA | GEOMETRY | {"Математика"}

DOMAINS = {
    "math": MATH,
    "history": {"История Казахстана", "Всемирная история", "Основы права"},  # чередуются: не больше 1 в день
    "rus": {"Русский язык", "Русская литература", "Литературное чтение",
            "Чтение и развитие речи", "Русский язык и литература"},
    "kaz": {"Казахский язык", "Казахская литература", "Казахский язык и литература"},
}

CHEMISTRY = "Химия"
# Совместители: профильный кабинет — только если свободен, иначе любой свободный.
# Бабича из каб.17 выселяет только химия Красноперовой.
ROOM_SEEKERS = {"Балташева Зару Такановна", "Аятова Анаргуль Жусуповна"}
# Запасные кабинеты для обычных уроков: лаборатории и мастерские, когда все обычные кабинеты заняты.
FALLBACK_ROOMS = ["room_19", "room_16", "room_29", "room_39"]
# Совместители, которым профильный кабинет не положен вовсе (только обычные свободные).
NO_LAB_SEEKERS: set[str] = set()
EXACT_DO_BUSY ={"Пащенко Наталья Аркадьевна", "Ажикенова Мадина Аскаровна"}
# Физкультура: основные классы — большой зал, маленькие (до 8 детей на уроке) — малый.
BIG_GYM = "room_01"
SMALL_GYM = "room_малый_зал"
SMALL_GYM_MAX_KIDS = 8
BABICH = "Бабич Иман Денисович"
ALEKPAROVA = "Алекпарова Алия Жумабаевна"
KRASNOPEROVA = "Красноперова Ольга Викторовна"
BABICH_ROOM = "room_17"
BABICH_SWAP_ROOM = "room_19"

# 1-4 → 5 уроков, 5-9 → 7, 10-11 → 8 (scheduling_rules.json).
# 3А (26 ч) и 4Б (27 ч) в 5×5 = 25 не помещаются — им разрешён 6-й урок (со штрафом).
# 10А — щадящий режим: граница 7-й урок. 6В (ЛУО) — не позже 6-го.
# 5–6 классы — не больше 6 уроков (7 — только с 7 класса); 11А — 1–7 уроки (Балташева теперь бывает Пн и Ср).
CLASS_MAX_LESSONS_OVERRIDE = {"3А": 6, "4Б": 6, "10А": 7, "6В": 6, "5А": 6, "5Б": 6, "6А": 6, "6Б": 6, "11А": 7}
# Перекрёстные подгруппы (6Б, 9Б): английский и информатика считаются по подгруппам, а оба
# перекрёстных урока (инф. 1Г + англ. 2Г и англ. 1Г + инф. 2Г) стоят в один день.
CROSS_SUBJECTS = {"Иностранный язык", "Информатика и искусственный интеллект"}


def load(name: str):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def grade_of(class_name: str) -> int:
    return int(re.match(r"\d+", class_name).group())


def language_of(subject: str, class_lang: str) -> str | None:
    """Язык, к которому относится предмет (для правила «не больше 2 языков в день»)."""
    if subject in ("Иностранный язык", "Английский язык"):
        return "eng"
    if subject.startswith("Казахск"):
        return "kaz"
    if subject.startswith("Русск") or subject == "Чтение и развитие речи":
        return "rus"
    if subject in ("Литературное чтение", "Обучение грамоте"):
        return "kaz" if class_lang == "kz" else "rus"
    return None


@dataclass
class Section:
    teacher: str
    attendees: list[tuple[str, str | None, str]]  # (класс, подгруппа|None, предмет)
    rooms: list[str]
    preferred_rooms: list[str]  # кабинеты без штрафа; прочие из rooms — со штрафом
    swap_penalty_rooms: list[str] = field(default_factory=list)

    @property
    def subjects(self) -> set[str]:
        return {a[2] for a in self.attendees}


@dataclass
class Meeting:
    id: str
    sections: list[Section]
    joint_id: str | None = None

    @property
    def teachers(self) -> set[str]:
        return {s.teacher for s in self.sections}

    @property
    def classes(self) -> set[str]:
        return {a[0] for s in self.sections for a in s.attendees}

    def class_subjects(self, cls: str) -> set[str]:
        return {a[2] for s in self.sections for a in s.attendees if a[0] == cls}

    def subject_teachers(self) -> set[tuple[str, str]]:
        return {(a[2], s.teacher) for s in self.sections for a in s.attendees}


@dataclass
class School:
    classes: list[str]
    class_lang: dict[str, str]
    class_type: dict[str, str]
    class_max_lessons: dict[str, int]
    teachers: list[str]
    availability: dict[str, list[list[bool]]]
    rooms: dict[str, dict]
    meetings: list[Meeting]
    hours: dict[tuple[str, str], int]  # (класс, предмет) → уроков-событий в неделю
    subject_weight: dict[tuple[str, str], int]
    related_groups: list[list[str]]
    curriculum_entries: list[dict]
    aisana: dict
    notes: list[str]


def _norm_teachers(entry) -> list[tuple[str, str | None]]:
    return [(t["fio"], t.get("subgroup")) for t in entry["teachers"]]


def build() -> School:
    cur = load("curriculum.json")
    classes_raw = load("classes.json")["classes"]
    overrides = load("overrides.json")
    joint = load("joint_lessons.json")["joint_lessons"]
    subgroup_rules = load("subgroup_rules.json")
    rooms_raw = load("rooms.json")["rooms"]
    room_rules = load("room_rules.json")
    avail_raw = load("teacher_availability.json")["teachers"]
    sched_rules = load("scheduling_rules.json")
    weights_raw = load("subject_weights.json")
    related = load("related_subjects.json")["groups"]
    aisana = load("special_ed_schedule.json")["students"][0]

    notes: list[str] = []
    entries = list(cur["entries"])
    # Ручные правки привязки учителей (overrides.json) — на случай, если curriculum.json собран раньше правки.
    for a in overrides.get("assignments", []):
        teachers = [t if isinstance(t, dict) else {"fio": t} for t in a["teachers"]]
        for e in entries:
            if e["class_name"] == a["class"] and e["subject_name"] == a["subject"]:
                if [t["fio"] for t in e["teachers"]] != [t["fio"] for t in teachers]:
                    notes.append(f"{a['class']} {a['subject']}: учитель по ручной правке — "
                                 f"{', '.join(t['fio'] for t in teachers)}")
                e["teachers"] = [{"teacher_source_id": None, **t} for t in teachers]
                e["split"] = len(teachers) > 1
    # Ручные правки часов (программа класса в БилимКлассе расходится с решением школы).
    for h in overrides.get("hours_overrides", []):
        for e in entries:
            if e["class_name"] == h["class"] and e["subject_name"] == h["subject"]:
                if e["weekly_hours"] != h["weekly_hours"]:
                    notes.append(f"{h['class']} {h['subject']}: {e['weekly_hours']} ч → {h['weekly_hours']} ч "
                                 f"({h.get('note', '')})")
                e["weekly_hours"] = h["weekly_hours"]
    # Предметы, которых нет в программе класса в БилимКлассе, но которые должны быть в расписании.
    for extra in overrides.get("extra_entries", []):
        entries.append({"class_name": extra["class"], "group_id": None, "subject_id": None,
                        "subject_name": extra["subject"], "weekly_hours": extra["weekly_hours"],
                        "period": "year", "teachers": extra["teachers"], "split": extra.get("split", False),
                        "manual": True})
        notes.append(f"{extra['class']} {extra['subject']} {extra['weekly_hours']} ч — добавлено вручную "
                     f"({extra.get('note', '')})")

    class_lang: dict[str, str] = {}
    for c in classes_raw:
        if c["status"] == "active":
            class_lang[c["class_name"]] = "kz" if c["language"].startswith("каз") else "ru"
    class_type = {c: "normal" for c in class_lang}
    for mark in overrides.get("class_marks", []):
        if mark.get("is_luo"):
            class_type[mark["class"]] = "luo"
            class_lang.setdefault(mark["class"], "ru")

    classes = [c for c in CLASS_ORDER if any(e["class_name"] == c for e in entries)]
    missing = {e["class_name"] for e in entries} - set(classes)
    if missing:
        raise ValueError(f"Классы вне порядка вывода: {missing}")

    limits = sched_rules["max_daily_lessons_by_grade"]

    def grade_limit(g: int) -> int:
        for rng, v in limits.items():
            lo, hi = (int(x) for x in rng.split("-"))
            if lo <= g <= hi:
                return v
        raise ValueError(g)

    class_max = {c: CLASS_MAX_LESSONS_OVERRIDE.get(c, grade_limit(grade_of(c))) for c in classes}
    headcount = {c["class_name"]: c["headcount"] for c in classes_raw if c["status"] == "active"}

    # --- кабинеты ---
    rooms = {r["id"]: r for r in rooms_raw if r.get("usable", True)}
    fixed_types = room_rules["fixed_room_types"]
    teacher_rooms = {t: [r for r in rs if r in rooms] for t, rs in room_rules["teacher_rooms"].items()}
    teacher_rooms = {t: rs for t, rs in teacher_rooms.items() if rs}
    home_rooms = room_rules["home_rooms"]
    home_room_ids = set(home_rooms.values())
    home_owner: dict[str, set[str]] = {}  # кабинет началки → чьи это классы
    for c, h in home_rooms.items():
        home_owner.setdefault(h, set()).add(c)
    floating_pool = [rid for rid, r in rooms.items()
                     if r["room_type"] in ("General", "LanguageLab") and rid not in home_room_ids]

    def section_rooms(teacher: str, subject: str, class_names: list[str]):
        """(допустимые, предпочтительные, штрафные-свап) кабинеты секции.

        Кабинет началки достаётся только своему классу: чужие классы в нём не занимаются."""
        rooms_, pref, swap = _section_rooms(teacher, subject, class_names)
        ok = lambda r: r not in home_owner or bool(home_owner[r] & set(class_names))  # noqa: E731
        allowed = [r for r in rooms_ if ok(r)]
        if not allowed:
            raise ValueError(f"{teacher} {subject} {class_names}: нет кабинета, кроме чужого кабинета началки")
        return allowed, [r for r in pref if ok(r)] or allowed, [r for r in swap if ok(r)]

    def _section_rooms(teacher: str, subject: str, class_names: list[str]):
        fixed = fixed_types.get(subject)
        if fixed and fixed.startswith("room_"):
            return [fixed], [fixed], []
        if fixed:
            typed = [rid for rid, r in rooms.items() if r["room_type"] == fixed]
            own = [rid for rid in teacher_rooms.get(teacher, []) if rid in typed]
            if teacher in NO_LAB_SEEKERS:
                return list(floating_pool), list(floating_pool), []
            if teacher in ROOM_SEEKERS:
                lab = [BABICH_ROOM] if subject == CHEMISTRY else typed
                return lab + [r for r in floating_pool if r not in lab], lab, []
            if subject == CHEMISTRY:
                return [BABICH_ROOM], [BABICH_ROOM], []
            if fixed == "Gym" and {BIG_GYM, SMALL_GYM} <= set(typed):
                size = sum(headcount.get(c, 0) for c in set(class_names))
                return typed, [SMALL_GYM if size <= SMALL_GYM_MAX_KIDS else BIG_GYM], []
            return (own or typed), (own or typed), []
        own = teacher_rooms.get(teacher)
        if own:
            if teacher == BABICH:
                return [BABICH_ROOM, BABICH_SWAP_ROOM], [BABICH_ROOM], [BABICH_SWAP_ROOM]
            if len(own) > 1:
                homes = [home_rooms.get(c) for c in class_names if home_rooms.get(c) in own]
                pick = homes[0] if homes else next(r for r in own if r not in home_room_ids)
                return [pick], [pick], []
            prim_homes = list(dict.fromkeys(home_rooms[c] for c in class_names if c in home_rooms))
            if prim_homes and not set(prim_homes) <= set(own) and subject != "Изобразительное искусство":
                # урок в 1–4 классе у учителя со своим кабинетом: учитель идёт в класс к детям;
                # если кабинет класса занят — к себе или в свободный. ИЗО, как и труд, — в мастерской учителя.
                return list(dict.fromkeys(prim_homes + own + floating_pool + FALLBACK_ROOMS)), prim_homes, []
            mine = {c for c, h in home_rooms.items() if h in own}
            if set(own) <= home_room_ids and not set(class_names) & mine:
                # классный руководитель началки ведёт другой класс: по умолчанию у себя, но может уйти
                # в свободный кабинет, если своему классу кабинет нужен в это время (учитель идёт, дети остаются)
                return own + floating_pool + FALLBACK_ROOMS, own, list(floating_pool) + FALLBACK_ROOMS
            return own, own, []
        # учитель без кабинета — занимает свободный
        prim = [home_rooms[c] for c in class_names if c in home_rooms]
        cand = list(dict.fromkeys(prim + floating_pool + FALLBACK_ROOMS))
        if teacher == ALEKPAROVA and set(class_names) & {"9Б", "10А"}:
            cand.append(BABICH_ROOM)
        return cand, (prim or floating_pool), []

    # --- нагрузка ---
    by_cs = {(e["class_name"], e["subject_name"]): e for e in entries}
    remaining = {k: e["weekly_hours"] for k, e in by_cs.items()}
    meetings: list[Meeting] = []

    def make_sections(parts: list[tuple[str, str]]) -> list[Section]:
        """parts: [(класс, предмет)] — все идут одновременно; делятся по учителям."""
        by_teacher: dict[str, list[tuple[str, str | None, str]]] = {}
        for cls, subj in parts:
            e = by_cs[(cls, subj)]
            for fio, sub in _norm_teachers(e):
                by_teacher.setdefault(fio, []).append((cls, sub, subj))
        out = []
        for fio, att in by_teacher.items():
            subj0 = att[0][2]
            rs, pref, swap = section_rooms(fio, subj0, [a[0] for a in att])
            out.append(Section(fio, att, rs, pref, swap))
        return out

    # 1) класс-комплекты
    for j in joint:
        subj_by_class = j.get("subjects") or {c: j["subject"] for c in j["classes"]}
        for h in range(j["hours_per_week"]):
            parts = [(c, subj_by_class[c]) for c in j["classes"]]
            for p in parts:
                if remaining.get(p, 0) <= 0:
                    raise ValueError(f"Класс-комплект {j['id']}: не хватает часов {p}")
                remaining[p] -= 1
            meetings.append(Meeting(f"{j['id']}#{h}", make_sections(parts), joint_id=j["id"]))

    # 2) перекрёстные подгруппы (информатика ↔ английский)
    split_teachers = {}
    for g in subgroup_rules["group_split_subjects"]:
        for c in g["classes"]:
            split_teachers[(c, g["subject"])] = g["teachers_by_group"]
    for cp in subgroup_rules["cross_pairs"]:
        for c in cp["classes"]:
            groups = ["1Г", "2Г"]
            for combo in cp["combos"]:
                for h in range(combo["count_per_week"]):
                    secs = []
                    for grp, subj in zip(groups, (combo["group_1"], combo["group_2"])):
                        fio = split_teachers[(c, subj)][grp]
                        rs, pref, swap = section_rooms(fio, subj, [c])
                        secs.append(Section(fio, [(c, grp, subj)], rs, pref, swap))
                    meetings.append(Meeting(f"{c}|cross|{combo['group_1']}+{combo['group_2']}#{h}", secs))
            eng = sum(cb["count_per_week"] for cb in cp["combos"]
                      if "Иностранный язык" in (cb["group_1"], cb["group_2"]))
            inf = sum(cb["count_per_week"] for cb in cp["combos"]
                      if "Информатика и искусственный интеллект" in (cb["group_1"], cb["group_2"]))
            per_group_eng = sum(cb["count_per_week"] * [cb["group_1"], cb["group_2"]].count("Иностранный язык")
                                for cb in cp["combos"]) // 2
            if per_group_eng != by_cs[(c, "Иностранный язык")]["weekly_hours"]:
                raise ValueError(f"{c}: перекрёстные пары не дают нужных часов английского")
            remaining[(c, "Иностранный язык")] = 0
            remaining[(c, "Информатика и искусственный интеллект")] = 0
            notes.append(f"{c}: английский/информатика — {eng} событий с английским, {inf} с информатикой (перекрёстно)")

    # 3) всё остальное
    for (cls, subj), h_left in remaining.items():
        for h in range(h_left):
            meetings.append(Meeting(f"{cls}|{subj}#{h}", make_sections([(cls, subj)])))
        remaining[(cls, subj)] = 0

    # часов (событий) по (класс, предмет)
    hours: dict[tuple[str, str], int] = {}
    for m in meetings:
        for c in m.classes:
            for s in m.class_subjects(c):
                hours[(c, s)] = hours.get((c, s), 0) + 1

    # --- доступность ---
    teachers = sorted({s.teacher for m in meetings for s in m.sections})
    availability = {}
    for t in teachers:
        mat = avail_raw.get(t)
        if mat is None:
            availability[t] = [[True] * PERIODS for _ in range(DAYS)]
        else:
            availability[t] = [row[:PERIODS] for row in mat[:DAYS]]
    # В файле доступности у учителей Айсаны закрыт весь блок 2–3 уроков, хотя занят
    # обычно один из них. Для этих учителей закрываем только их реальные уроки ДО.
    do_teachers = {it["teacher"] for items in aisana["schedule"].values() for it in items}
    for t in EXACT_DO_BUSY | do_teachers:
        busy = {(DAY_LABELS.index(day), it["period"] - 1)
                for day, items in aisana["schedule"].items() for it in items if it["teacher"] == t}
        for d in range(DAYS):
            for p in range(PERIODS):
                if not availability[t][d][p] and (d, p) not in busy and p in (1, 2):
                    availability[t][d][p] = True
        notes.append(f"{t}: недоступна только на своих уроках ДО ({sorted((DAY_LABELS[d], p + 1) for d, p in busy)})")
    # Занятия всех учеников ДО закрывают учителя в школе. Урок задан номером (совпадает со звонками)
    # или временем начала «ЧЧ:ММ» (45 минут) — тогда закрываются все пересекающиеся школьные уроки.
    bells = {int(k): v for k, v in load("time_grid.json").get("bells", {}).items()}

    def minutes(hhmm: str) -> int:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)

    for st in load("special_ed_schedule.json")["students"]:
        for day, items in st["schedule"].items():
            d = DAY_LABELS.index(day)
            for it in items:
                t = it["teacher"]
                if t not in availability:
                    continue
                if isinstance(it["period"], int):
                    blocked = [it["period"] - 1]
                elif ":" not in str(it["period"]):  # время занятия неизвестно
                    continue
                else:
                    a = minutes(it["period"])
                    b = a + 45
                    blocked = [n - 1 for n, span in bells.items() if n <= PERIODS and
                               minutes(span.split("-")[0]) < b and minutes(span.split("-")[1]) > a]
                for p in blocked:
                    availability[t][d][p] = False
                if st is not aisana:
                    notes.append(f"{t}: занята с {st['student']} ({st['class']} ДО) — {day}, "
                                 f"школьные уроки {', '.join(str(p + 1) for p in blocked)}")

    # --- СанПиН-веса ---
    li = weights_raw["language_independent"]
    ld = weights_raw["language_dependent"]
    subject_weight = {}
    for (c, s) in hours:
        if s in li:
            w = li[s]
        elif s in ld:
            w = ld[s][class_lang.get(c, "ru")]
        else:
            w = 5
            notes.append(f"Нет СанПиН-веса для «{s}» — взят 5")
        subject_weight[(c, s)] = w

    return School(
        classes=classes,
        class_lang=class_lang,
        class_type=class_type,
        class_max_lessons=class_max,
        teachers=teachers,
        availability=availability,
        rooms=rooms,
        meetings=meetings,
        hours=hours,
        subject_weight=subject_weight,
        related_groups=[g["subjects"] for g in related],
        curriculum_entries=entries,
        aisana=aisana,
        notes=notes,
    )


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    s = build()
    print(f"классов {len(s.classes)}, учителей {len(s.teachers)}, кабинетов {len(s.rooms)}, событий {len(s.meetings)}")
    for n in s.notes:
        print("  ·", n)
    load_t: dict[str, int] = {}
    for m in s.meetings:
        for t in m.teachers:
            load_t[t] = load_t.get(t, 0) + 1
    print("\nУчитель: событий / доступных слотов (8 уроков)")
    for t in sorted(load_t, key=lambda t: -load_t[t]):
        free = sum(sum(r) for r in s.availability[t])
        flag = "  <-- МАЛО" if free < load_t[t] + 2 else ""
        print(f"  {t:40s} {load_t[t]:3d} / {free:3d}{flag}")
    per_class: dict[str, int] = {}
    for m in s.meetings:
        for c in m.classes:
            per_class[c] = per_class.get(c, 0) + 1
    print("\nКласс: уроков в неделю / лимит (дней × макс уроков)")
    for c in s.classes:
        print(f"  {c:4s} {per_class[c]:3d} / {DAYS * s.class_max_lessons[c]}")
    multi = [m for m in s.meetings if len(m.sections) > 1 or len(m.classes) > 1]
    print(f"\nСложных событий (подгруппы/комплекты): {len(multi)}")
    for m in multi:
        print("  ", m.id, "→", " || ".join(
            f"{sec.teacher.split()[0]}: " + ", ".join(f"{a[0]}{'/' + a[1] if a[1] else ''} {a[2]}" for a in sec.attendees)
            + f" [{','.join(sec.rooms[:3])}{'…' if len(sec.rooms) > 3 else ''}]"
            for sec in m.sections))

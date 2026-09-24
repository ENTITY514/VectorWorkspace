"""CP-SAT модель расписания по урокам-событиям (см. dataset.py)."""
from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from dataset import (FALLBACK_ROOMS, ALEKPAROVA, ALGEBRA, BABICH, BABICH_ROOM, BABICH_SWAP_ROOM, BIG_GYM, CHEMISTRY, CROSS_SUBJECTS, DAYS,
                     DOMAINS, GEOMETRY, KRASNOPEROVA, MATH, PERIODS, ROOM_SEEKERS, School, grade_of,
                     language_of)

SANPIN_CURVE = [7, 11, 11, 9, 7]
SANPIN_TOL = 5          # допуск отклонения дневной суммы баллов
SANPIN_POINTS_PER_UNIT = 5  # 5 баллов СанПиН = 1 единица штрафа


@dataclass
class Profile:
    name: str
    title: str
    window: int = 400
    sanpin: int = 200
    room: int = 120
    alternation: int = 100
    load_balance: int = 80
    late_start: int = 300
    eighth_lesson: int = 300
    sixth_primary: int = 100
    primary_home_room: int = 20
    # персональные (Бабич) и 10А
    babich: bool = True
    babich_window_english: int = 300
    babich_window_english_hard: bool = False
    babich_chem_swap: int = 120
    babich_extra_window: int = 400
    babich_late: int = 200
    babich_finish_lesson: int = 5          # без штрафа уходит после этого урока
    babich_window_english_bonus: int = 0   # бонус за окно, занятое английским Алекпаровой в каб.17
    primary_start_hard: bool = False       # 1–4 классы всегда с 1-го урока
    late_start_upper: int | None = None    # штраф позднего старта для 5–11 (None = late_start)
    no_window_teachers: tuple = ()         # учителя без окон (жёстко)
    start_hard_except: tuple | None = None  # все классы с 1-го урока (жёстко), кроме перечисленных
    balanced_hard: tuple = ()              # классы: разница уроков между днями ≤ 1 (жёстко)
    gym: int = 120                         # физкультура не в «своём» зале (большой/малый)
    fixed_slots: dict = field(default_factory=dict)  # индекс события → (день, урок), жёстко
    # закрепления: {"class","subject","day"(0..4),"period"(1..8), опц. "teacher","room"} — жёстко
    pins: list = field(default_factory=list)
    babich_windows_at: list = field(default_factory=list)  # (день, урок 1..8) — у Бабича окно (жёстко)
    alia_all_in_babich_windows: bool = False  # все английские Алекпаровой 9Б/10А — в окна Бабича, каб.17
    babich_free_windows_per_day: int = 1
    primary_lang_limit: int = 0            # штраф за 3-й разный язык в день у 1–4 классов
    primary_curve: tuple | None = None     # кривая СанПиН для 1–4 классов
    math_one_later_teachers: tuple = ()    # их математика — на 1 урок позже обычного предела
    math_one_later_days: tuple | None = None  # в какие дни действует послабление (None — во все)
    base_slots: dict = field(default_factory=dict)  # событие → (день, урок) базовой версии
    change_weight: int = 0                 # штраф за каждый урок, сдвинутый относительно базы
    babich_max_swaps: int | None = None    # жёсткий предел числа уроков Бабича не в своём кабинете
    upper_curve: tuple = (7, 11, 11, 9, 7)  # доли дневной нагрузки 5–11 классов (Пн..Пт)
    natural_same_day_subjects: tuple = ("Физика", "Химия", "Биология")  # эти — не в один день (штраф)
    sanpin_tol: int = SANPIN_TOL           # допуск дневной суммы баллов СанПиН
    sanpin_graded: bool = False            # штраф за время трудного урока пропорционален трудности (≥7 баллов)
    min_seven_days: tuple = ()             # у этих классов дней с 7-м уроком — не больше вынужденного минимума
    keep_slots: dict = field(default_factory=dict)  # урок → (день, урок) предыдущей версии
    keep_weight: int = 0                   # штраф за сдвиг урока относительно предыдущей версии
    light_first_soft_classes: tuple = ()   # для них — только штраф (light_first_points), не запрет
    light_first_hard: bool = False         # музыка/ИЗО/труд 1-м уроком у 5–11 — запрещено
    light_first_points: int = 0            # баллы СанПиН за музыку/ИЗО/труд 1-м уроком у 5–11 классов
    cycle_same: int = 0                    # 5–11: два урока одного цикла (ест.-мат. / гуманитарный) подряд
    no_consecutive_days: tuple = ()        # эти предметы у класса не идут два дня подряд (жёстко)
    cross_adjacent: bool = False           # перекрёстные английский/информатика по группам — два урока подряд
    mwf_three: int = 0                     # штраф за урок 3-часового предмета (англ., физ-ра, история+право) во Вт/Чт
    lang_limit_all: int = 0                # штраф за 3-й разный язык в день у 5–11 классов
    forbid_rooms: dict = field(default_factory=dict)  # учитель → кабинеты, которые ему не даются
    gym_hard_classes: tuple = ()           # физкультура этих классов — строго в зале по размеру класса
    babich_no_swap_classes: tuple = ()     # в этих классах Бабич всегда в своём кабинете (без обмена с химией)
    window_low_teachers: tuple = ()        # учителя с пониженным весом окон (совместители)
    window_low: int = 0
    # равномерность нагрузки учителя по неделе (кроме window_low_teachers):
    # жёстко — не больше ceil(уроков / рабочих дней) + 1 в день; мягко — разброс между днями сверх 2
    teacher_day_cap: bool = False
    teacher_spread: int = 0
    # естественные предметы (физика, химия, биология): разные — не подряд (жёстко), в один день — штраф
    natural_not_adjacent: bool = False
    natural_same_day: int = 0
    natural_exempt_classes: tuple = ()     # классы с закреплённым расписанием — правило не применяется
    teacher_cap_exempt: tuple = ()         # учителя, у которых закреплённые уроки уже превышают предел
    teacher_cap_extra: int = 1             # предел в день = ceil(уроков / рабочих дней) + это число
    class10_factor: int = 2
    time_limit: int = 600
    seed: int = 1
    description: str = ""
    extra: dict = field(default_factory=dict)


LIGHT_FIRST = {"Музыка", "Изобразительное искусство", "Художественный труд", "Трудовое обучение"}
CYCLE_OF = {sj: "ем" for sj in ("Математика", "Алгебра", "Геометрия", "Алгебра и начала анализа", "Физика", "Химия",
                                 "Биология", "Информатика и искусственный интеллект", "География", "Естествознание")}
CYCLE_OF.update({sj: "гум" for sj in (
    "Казахский язык", "Казахская литература", "Казахский язык и литература", "Русский язык", "Русская литература",
    "Русский язык и литература", "Чтение и развитие речи", "Иностранный язык", "Английский язык",
    "История Казахстана", "Всемирная история", "Основы права", "Основы предпринимательства и бизнеса")})
# физкультура, музыка, ИЗО, труд, НВП — нейтральные: разбивают пару


def mwf_groups(s) -> dict[tuple, list[int]]:
    """(класс, подгруппа, предмет | «история+право») → уроки, если их ровно 3 в неделю."""
    groups: dict[tuple, list[int]] = {}
    for mi, mt in enumerate(s.meetings):
        for sec in mt.sections:
            for c, sub, sj in sec.attendees:
                key = (c, sub, "история+право" if sj in DOMAINS["history"] else sj)
                groups.setdefault(key, [])
                if mi not in groups[key]:
                    groups[key].append(mi)
    return {k: v for k, v in groups.items() if len(v) == 3}


class Built:
    def __init__(self, school: School, prof: Profile):
        self.s = school
        self.p = prof
        self.m = cp_model.CpModel()
        self.x: dict[tuple[int, int, int], cp_model.IntVar] = {}
        self.r: dict[tuple[int, int, str], cp_model.IntVar] = {}
        self.terms: dict[str, list] = {}
        self.relaxed_daily: list[str] = []

    # ---------- helpers ----------
    def pen(self, key: str, weight: int, expr):
        if weight:
            self.terms.setdefault(key, []).append((weight, expr))

    def bool_and(self, a, b, name):
        v = self.m.NewBoolVar(name)
        self.m.Add(v <= a)
        self.m.Add(v <= b)
        self.m.Add(v >= a + b - 1)
        return v

    def eq_bool(self, expr, name):
        v = self.m.NewBoolVar(name)
        self.m.Add(v == expr)
        return v

    # ---------- build ----------
    def build(self):
        s, m = self.s, self.m
        meetings = s.meetings
        cap = s.class_max_lessons

        # 1. переменные слотов с предфильтрами
        for mi, mt in enumerate(meetings):
            subj_all = {a[2] for sec in mt.sections for a in sec.attendees}
            is_math = bool(subj_all & MATH)
            has_geo_class = any((c, "Геометрия") in s.hours for c in mt.classes)
            for d in range(DAYS):
                for p in range(PERIODS):
                    if any(not s.availability[t][d][p] for t in mt.teachers):
                        continue
                    if any(p >= cap[c] for c in mt.classes):
                        continue
                    if is_math:
                        shift = 1 if (mt.teachers & set(self.p.math_one_later_teachers) and (
                            self.p.math_one_later_days is None or d in self.p.math_one_later_days)) else 0
                        if p >= 5 + shift or (d in (0, 4) and p >= 4 + shift):
                            continue
                        if d == 0 and subj_all & GEOMETRY:
                            continue
                        if d == 1 and subj_all & ALGEBRA and has_geo_class:
                            continue
                    self.x[(mi, d, p)] = m.NewBoolVar(f"x{mi}_{d}{p}")
            slots = [self.x[(mi, d, p)] for d in range(DAYS) for p in range(PERIODS) if (mi, d, p) in self.x]
            if not slots:
                raise ValueError(f"Нет допустимого слота для {mt.id}")
            m.AddExactlyOne(slots)
            if mi in self.p.fixed_slots:
                d, p = self.p.fixed_slots[mi]
                if (mi, d, p) not in self.x:
                    raise ValueError(f"Закреплённый слот недопустим: {mt.id} → {d},{p}")
                m.Add(self.x[(mi, d, p)] == 1)

        def X(mi, d, p):
            return self.x.get((mi, d, p), 0)

        # 2. учитель ≤ 1
        self.by_teacher: dict[str, list[int]] = {}
        for mi, mt in enumerate(meetings):
            for t in mt.teachers:
                self.by_teacher.setdefault(t, []).append(mi)
        self.busy = {}
        for t, mis in self.by_teacher.items():
            for d in range(DAYS):
                for p in range(PERIODS):
                    vs = [self.x[(mi, d, p)] for mi in mis if (mi, d, p) in self.x]
                    if not vs:
                        self.busy[(t, d, p)] = 0
                        continue
                    if len(vs) > 1:
                        m.AddAtMostOne(vs)
                    self.busy[(t, d, p)] = self.eq_bool(sum(vs), f"b_{t[:6]}_{d}{p}")

        # 3. класс ≤ 1, непрерывность, лимиты, поздний старт, 8-й урок
        self.by_class: dict[str, list[int]] = {}
        for mi, mt in enumerate(meetings):
            for c in mt.classes:
                self.by_class.setdefault(c, []).append(mi)
        self.occ = {}
        for c, mis in self.by_class.items():
            for d in range(DAYS):
                for p in range(PERIODS):
                    vs = [self.x[(mi, d, p)] for mi in mis if (mi, d, p) in self.x]
                    if len(vs) > 1:
                        m.AddAtMostOne(vs)
                    self.occ[(c, d, p)] = self.eq_bool(sum(vs), f"o_{c}_{d}{p}") if vs else 0
                o = [self.occ[(c, d, p)] for p in range(PERIODS)]
                for p1 in range(PERIODS):
                    for p2 in range(p1 + 1, PERIODS):
                        for p3 in range(p2 + 1, PERIODS):
                            if isinstance(o[p1], int) or isinstance(o[p3], int):
                                continue
                            m.Add(o[p1] + o[p3] - o[p2] <= 1)
                m.Add(sum(o) <= cap[c])
                real = [v for v in o if not isinstance(v, int)]
                has = m.NewBoolVar(f"has_{c}_{d}")
                m.AddMaxEquality(has, real)
                start_hard = (grade_of(c) <= 4 and self.p.primary_start_hard) or (
                    self.p.start_hard_except is not None and c not in self.p.start_hard_except)
                if start_hard:
                    m.Add(o[0] >= has)
                else:
                    w_late = self.p.late_start
                    if grade_of(c) >= 5 and self.p.late_start_upper is not None:
                        w_late = self.p.late_start_upper
                    self.pen("late_start", w_late, has - o[0])
                if not isinstance(o[7], int):
                    self.pen("eighth_lesson", self.p.eighth_lesson, o[7])
                if cap[c] == 6 and grade_of(c) <= 4 and not isinstance(o[5], int):
                    self.pen("sixth_primary", self.p.sixth_primary, o[5])

        # 4. предмет в день; домены
        self._subject_day_rules()

        # 5. кабинеты
        self._rooms()

        # 6. мягкие: окна учителей, СанПиН, баланс, чередование
        self._teacher_windows()
        self._sanpin()
        self._balance()
        self._alternation()
        if self.p.babich:
            self._babich()
        self._pins()
        if self.p.primary_lang_limit or self.p.lang_limit_all:
            self._primary_languages()
        if self.p.cross_adjacent:
            self._cross_adjacent()
        if self.p.cycle_same:
            self._cycles()
        for sj in self.p.no_consecutive_days:
            for c in s.classes:
                if c in self.p.natural_exempt_classes or (c, sj) not in self.cs_meetings:
                    continue
                mis = self.cs_meetings[(c, sj)]
                has = []
                for d in range(DAYS):
                    vs = [v for mi in mis for (i, dd, p), v in self._x_of(mi) if dd == d]
                    h = m.NewBoolVar(f"ncd_{c}_{d}") if vs else 0
                    if vs:
                        m.AddMaxEquality(h, vs)  # есть ли предмет в этот день (сдвоенный урок — один день)
                    has.append(h)
                for d in range(DAYS - 1):
                    if not (isinstance(has[d], int) and isinstance(has[d + 1], int)):
                        m.Add(has[d] + has[d + 1] <= 1)
        if self.p.mwf_three:
            self._mwf_three()
        if self.p.teacher_day_cap or self.p.teacher_spread:
            self._teacher_balance()
        if self.p.natural_not_adjacent or self.p.natural_same_day:
            self._natural_sciences()
        for c in self.p.min_seven_days:
            n = len(self.by_class[c])
            m.Add(sum(self.occ[(c, d, 6)] for d in range(DAYS)) <= max(0, n - 6 * DAYS))
        for mi, (d, p) in self.p.keep_slots.items():
            if self.p.keep_weight:
                v = self.x.get((mi, d, p))
                self.pen("moved_vs_prev", self.p.keep_weight, 1 - v if v is not None else 1)
        if self.p.change_weight:
            for mi, (d, p) in self.p.base_slots.items():
                v = self.x.get((mi, d, p))
                self.pen("moved_vs_base", self.p.change_weight, 1 - v if v is not None else 1)
        return self

    def _teacher_balance(self):
        m = self.m
        for t, mis in self.by_teacher.items():
            if t in self.p.window_low_teachers:
                continue
            days = [d for d in range(DAYS) if any(self.s.availability[t][d][:PERIODS])]
            cap_on = self.p.teacher_day_cap and t not in self.p.teacher_cap_exempt
            if len(days) < 2:
                continue
            counts = []
            for d in days:
                cnt = m.NewIntVar(0, PERIODS, f"tc_{t[:6]}_{d}")
                m.Add(cnt == sum(v for mi in mis for (i, dd, p), v in self._x_of(mi) if dd == d))
                counts.append(cnt)
                if cap_on:
                    m.Add(cnt <= math.ceil(len(mis) / len(days)) + self.p.teacher_cap_extra)
            if self.p.teacher_spread:
                mx = m.NewIntVar(0, PERIODS, f"tmx_{t[:6]}")
                mn = m.NewIntVar(0, PERIODS, f"tmn_{t[:6]}")
                m.AddMaxEquality(mx, counts)
                m.AddMinEquality(mn, counts)
                ex = m.NewIntVar(0, PERIODS, f"tex_{t[:6]}")
                m.Add(ex >= mx - mn - 2)
                self.pen("teacher_spread", self.p.teacher_spread, ex)

    def _natural_sciences(self):
        s, m = self.s, self.m
        nat = ("Физика", "Химия", "Биология")
        for c in s.classes:
            if c in self.p.natural_exempt_classes:
                continue
            present = [sj for sj in nat if (c, sj) in self.cs_meetings]
            if len(present) < 2:
                continue
            for d in range(DAYS):
                occ = {sj: [self._occ_sub(self.cs_meetings[(c, sj)], d, p) for p in range(PERIODS)]
                       for sj in present}
                if self.p.natural_not_adjacent:
                    for a in present:
                        for b in present:
                            if a == b:
                                continue
                            for p in range(PERIODS - 1):
                                if not isinstance(occ[a][p], int) and not isinstance(occ[b][p + 1], int):
                                    m.Add(occ[a][p] + occ[b][p + 1] <= 1)
                if self.p.natural_same_day:
                    has = []
                    for sj in [x for x in present if x in self.p.natural_same_day_subjects]:
                        vs = [v for v in occ[sj] if not isinstance(v, int)]
                        if vs:
                            h = m.NewBoolVar(f"nat_{c}_{sj[:3]}_{d}")
                            m.AddMaxEquality(h, vs)
                            has.append(h)
                    if len(has) >= 2:
                        ex = m.NewIntVar(0, 3, f"natex_{c}_{d}")
                        m.Add(ex >= sum(has) - 1)
                        self.pen("natural_same_day", self.p.natural_same_day, ex)

    def _pins(self):
        s, m = self.s, self.m
        day_counts: dict[tuple, int] = {}
        for pin in self.p.pins:
            if pin.get("period") is None:  # закрепление на день: предмет стоит в этот день N раз
                day_counts[(pin["class"], pin["subject"], pin["day"])] = \
                    day_counts.get((pin["class"], pin["subject"], pin["day"]), 0) + 1
        for (c, sj, d), n in day_counts.items():
            mis = [mi for mi, mt in enumerate(s.meetings) if c in mt.classes and sj in mt.class_subjects(c)]
            day = [self.x[(mi, d, p)] for mi in mis for p in range(PERIODS) if (mi, d, p) in self.x]
            if len(day) < n:
                raise ValueError(f"Закрепление на день невозможно: {c} {sj} {d}")
            m.Add(sum(day) == n)
        for pin in self.p.pins:
            if pin.get("period") is None:
                continue
            c, sj, d, p = pin["class"], pin["subject"], pin["day"], pin["period"] - 1
            mis = [mi for mi, mt in enumerate(s.meetings)
                   if c in mt.classes and sj in mt.class_subjects(c)
                   and (not pin.get("teacher") or pin["teacher"] in mt.teachers)]
            if not any((mi, d, p) in self.x for mi in mis):
                raise ValueError(f"Закрепление невозможно: {pin}")
            m.Add(sum(self.x[(mi, d, p)] for mi in mis if (mi, d, p) in self.x) == 1)
            if pin.get("room"):
                zs = []
                for mi in mis:
                    if (mi, d, p) not in self.x:
                        continue
                    for si, sec in enumerate(s.meetings[mi].sections):
                        if sec.teacher != pin.get("teacher") or pin["room"] not in sec.rooms:
                            continue
                        rv = self.r.get((mi, si, pin["room"]), 1)
                        zs.append(self.bool_and(self.x[(mi, d, p)], rv, "pin") if not isinstance(rv, int)
                                  else self.x[(mi, d, p)])
                m.Add(sum(zs) >= 1)

    def _primary_languages(self):
        s, m = self.s, self.m
        for c in s.classes:
            weight = self.p.primary_lang_limit if grade_of(c) <= 4 else self.p.lang_limit_all
            if not weight:
                continue
            by_lang: dict[str, list[int]] = {}
            for mi in self.by_class[c]:
                for sj in s.meetings[mi].class_subjects(c):
                    lang = language_of(sj, s.class_lang.get(c, "ru"))
                    if lang:
                        by_lang.setdefault(lang, []).append(mi)
            if len(by_lang) < 3:
                continue
            for d in range(DAYS):
                hs = []
                for lang, mis in by_lang.items():
                    vs = [v for mi in mis for (i, dd, p), v in self._x_of(mi) if dd == d]
                    if vs:
                        h = m.NewBoolVar(f"lang_{c}_{lang}_{d}")
                        m.AddMaxEquality(h, vs)
                        hs.append(h)
                ex = m.NewIntVar(0, 3, f"langex_{c}_{d}")
                m.Add(ex >= sum(hs) - 2)
                self.pen("primary_languages" if grade_of(c) <= 4 else "languages", weight, ex)

    def _cycles(self):
        """5–11 классы: не ставить подряд два урока одного цикла (естественно-математический / гуманитарный)."""
        s, m = self.s, self.m
        for c in s.classes:
            if grade_of(c) <= 4 or c in self.p.natural_exempt_classes:
                continue
            kind = {}
            for mi in self.by_class[c]:
                cyc = {CYCLE_OF.get(sj) for sj in s.meetings[mi].class_subjects(c)}
                if len(cyc) == 1 and None not in cyc:
                    kind[mi] = cyc.pop()
            for cyc in ("ем", "гум"):
                mis = [mi for mi, k in kind.items() if k == cyc]
                for d in range(DAYS):
                    occ = [self._occ_sub(mis, d, p) for p in range(PERIODS)]
                    for p in range(PERIODS - 1):
                        if isinstance(occ[p], int) or isinstance(occ[p + 1], int):
                            continue
                        self.pen("cycles", self.p.cycle_same, self.bool_and(occ[p], occ[p + 1], "cy"))

    def _cross_adjacent(self):
        """Перекрёстные уроки (информатика 1Г + английский 2Г, затем наоборот) — подряд в один день."""
        s, m = self.s, self.m
        for c in {c for mt in s.meetings if "|cross|" in mt.id for c in mt.classes}:
            pair = [mi for mi, mt in enumerate(s.meetings)
                    if c in mt.classes and "|cross|" in mt.id and
                    {a[2] for sec in mt.sections for a in sec.attendees} == CROSS_SUBJECTS]
            if len(pair) != 2:
                continue
            diff = m.NewIntVar(-DAYS * PERIODS, DAYS * PERIODS, f"crossd_{c}")
            m.Add(diff == self.t[pair[0]] - self.t[pair[1]])
            adiff = m.NewIntVar(0, DAYS * PERIODS, f"crossa_{c}")
            m.AddAbsEquality(adiff, diff)
            m.Add(adiff == 1)  # вместе с «в один день» — соседние уроки

    def _mwf_three(self):
        """Любой предмет с 3 часами в неделю (по группе) и история+право вместе — по возможности на Пн, Ср, Пт."""
        self.mwf_groups = mwf_groups(self.s)
        for (c, sub, kind), mis in self.mwf_groups.items():
            for mi in mis:
                for (i, d, p), v in self._x_of(mi):
                    if d in (1, 3):
                        self.pen("mwf_three", self.p.mwf_three, v)

    def _occ_sub(self, mis, d, p):
        return sum(self.x[(mi, d, p)] for mi in mis if (mi, d, p) in self.x)

    def _subject_day_rules(self):
        s, m = self.s, self.m
        cs_meetings: dict[tuple[str, str], list[int]] = {}
        for mi, mt in enumerate(s.meetings):
            for c in mt.classes:
                for subj in mt.class_subjects(c):
                    cs_meetings.setdefault((c, subj), []).append(mi)
        self.cs_meetings = cs_meetings
        cross_classes = {c for mt in s.meetings if "|cross|" in mt.id for c in mt.classes}
        # перекрёстные подгруппы: предмет считается по подгруппе, оба перекрёстных урока — в один день
        for c in cross_classes:
            by_sub: dict[tuple[str, str], list[int]] = {}
            for mi, mt in enumerate(s.meetings):
                for sec in mt.sections:
                    for cc, sub, sj in sec.attendees:
                        if cc == c and sj in CROSS_SUBJECTS:
                            by_sub.setdefault((sub, sj), []).append(mi)
            for (sub, sj), mis in by_sub.items():
                for d in range(DAYS):
                    m.Add(sum(self._occ_sub(mis, d, p) for p in range(PERIODS)) <= 1)
            pair = [mi for mi, mt in enumerate(s.meetings)
                    if c in mt.classes and "|cross|" in mt.id and
                    {a[2] for sec in mt.sections for a in sec.attendees} == CROSS_SUBJECTS]
            if len(pair) == 2:
                for d in range(DAYS):
                    m.Add(sum(self._occ_sub([pair[0]], d, p) for p in range(PERIODS)) ==
                          sum(self._occ_sub([pair[1]], d, p) for p in range(PERIODS)))
        for (c, subj), mis in cs_meetings.items():
            if c in cross_classes and subj in CROSS_SUBJECTS:
                continue
            n = len(mis)
            days_avail = {d for mi in mis for (d) in range(DAYS)
                          if any((mi, d, p) in self.x for p in range(PERIODS))}
            lim = 1 if n <= DAYS else 2
            forced_double = False
            if len(days_avail) < n and lim * len(days_avail) < n:
                lim = math.ceil(n / len(days_avail))
                forced_double = True
                self.relaxed_daily.append(
                    f"{c} {subj}: {n} ч, учитель доступен только {len(days_avail)} дн. — {lim} урока в день подряд")
            for d in range(DAYS):
                day = [self._occ_sub(mis, d, p) for p in range(PERIODS)]
                m.Add(sum(day) <= lim)
                if forced_double:
                    for p1 in range(PERIODS):
                        for p2 in range(p1 + 2, PERIODS):
                            m.Add(day[p1] + day[p2] <= 1)
                elif lim >= 2:
                    for p in range(PERIODS - 1):
                        m.Add(day[p] + day[p + 1] <= 1)
        # домены: ≤5 ч → 1 в день; >5 → ≤2 и тогда подряд.
        # В 1–4 классах не применяем: там язык и чтение по практике школы стоят в один день,
        # а разведение языков обеспечивает отдельное правило (не больше 2 языков в день).
        for c in s.classes:
            if grade_of(c) <= 4:
                continue
            for dom, subjects in DOMAINS.items():
                present = [sj for sj in subjects if (c, sj) in cs_meetings]
                if len(present) < 2:
                    continue
                mis = sorted({mi for sj in present for mi in cs_meetings[(c, sj)]})
                tot = len(mis)
                for d in range(DAYS):
                    day = [self._occ_sub(mis, d, p) for p in range(PERIODS)]
                    if tot <= DAYS:
                        m.Add(sum(day) <= 1)
                    else:
                        m.Add(sum(day) <= 2)
                        for p1 in range(PERIODS):
                            for p2 in range(p1 + 2, PERIODS):
                                m.Add(day[p1] + day[p2] <= 1)

    def _rooms(self):
        s, m = self.s, self.m
        horizon = DAYS * PERIODS
        intervals: dict[str, list] = {}
        self.t = {}
        for mi, mt in enumerate(s.meetings):
            t = m.NewIntVar(0, horizon - 1, f"t{mi}")
            m.Add(t == sum((d * PERIODS + p) * v for (i, d, p), v in self._x_of(mi)))
            self.t[mi] = t
            for si, sec in enumerate(mt.sections):
                if len(sec.rooms) == 1:
                    rid = sec.rooms[0]
                    intervals.setdefault(rid, []).append(m.NewIntervalVar(t, 1, t + 1, f"iv{mi}_{si}"))
                    continue
                rv = []
                for rid in sec.rooms:
                    v = m.NewBoolVar(f"r{mi}_{si}_{rid}")
                    self.r[(mi, si, rid)] = v
                    if rid in self.p.forbid_rooms.get(sec.teacher, ()):
                        m.Add(v == 0)  # учителю этот кабинет не даём
                    if rid in FALLBACK_ROOMS and rid not in sec.preferred_rooms and rid not in sec.swap_penalty_rooms:
                        self.pen("room", self.p.room, v)  # запасной кабинет (лаборатория/мастерская)
                    rv.append(v)
                    intervals.setdefault(rid, []).append(
                        m.NewOptionalIntervalVar(t, 1, t + 1, v, f"iv{mi}_{si}_{rid}"))
                    if rid in sec.swap_penalty_rooms:
                        self.pen("room", self.p.room, v)
                    elif BIG_GYM in sec.rooms:
                        if rid not in sec.preferred_rooms:
                            if set(mt.classes) & set(self.p.gym_hard_classes):
                                m.Add(v == 0)  # этим классам — только свой зал
                            else:
                                self.pen("gym", self.p.gym, v)
                    elif rid not in sec.preferred_rooms and any(grade_of(c) <= 4 for c in mt.classes):
                        self.pen("primary_home_room", self.p.primary_home_room, v)
                    elif rid not in sec.preferred_rooms and sec.teacher in ROOM_SEEKERS:
                        # лаборатория свободна — совместитель идёт в неё (химия/физика)
                        self.pen("seeker_room", max(self.p.primary_home_room, 100), v)
                m.AddExactlyOne(rv)
        for rid, ivs in intervals.items():
            if len(ivs) > 1:
                m.AddNoOverlap(ivs)
        # Бабич уходит в каб.19 только на время химии Красноперовой
        krasn_chem = [mi for mi, mt in enumerate(s.meetings)
                      if any(sec.teacher == KRASNOPEROVA and CHEMISTRY in sec.subjects for sec in mt.sections)]
        self.krasn_chem = krasn_chem
        if self.p.babich_max_swaps is not None:
            m.Add(sum(v for (mi, si, rid), v in self.r.items()
                      if rid == BABICH_SWAP_ROOM and s.meetings[mi].sections[si].teacher == BABICH)
                  <= self.p.babich_max_swaps)
        for (mi, si, rid), v in self.r.items():
            if (rid == BABICH_ROOM and s.meetings[mi].sections[si].teacher == BABICH
                    and set(s.meetings[mi].classes) & set(self.p.babich_no_swap_classes)):
                m.Add(v == 1)
            if rid != BABICH_SWAP_ROOM or s.meetings[mi].sections[si].teacher != BABICH:
                continue
            for (i, d, p), xv in self._x_of(mi):
                m.Add(xv + v - 1 <= self._occ_sub(krasn_chem, d, p))
        # одинаковые уроки взаимозаменяемы — фиксируем их порядок во времени
        groups: dict[tuple, list[int]] = {}
        for mi, mt in enumerate(s.meetings):
            sig = tuple(sorted((sec.teacher, tuple(sorted(sec.attendees, key=str)), tuple(sec.rooms))
                               for sec in mt.sections))
            groups.setdefault(sig, []).append(mi)
        self.sym_groups = [mis for mis in groups.values() if len(mis) > 1]
        for mis in self.sym_groups:
            for a, b in zip(mis, mis[1:]):
                m.Add(self.t[a] < self.t[b])

    def _x_of(self, mi):
        if not hasattr(self, "_xidx"):
            self._xidx = {}
            for (i, d, p), v in self.x.items():
                self._xidx.setdefault(i, []).append(((i, d, p), v))
        return self._xidx.get(mi, [])

    def _teacher_windows(self):
        m = self.m
        self.first, self.last, self.tcount = {}, {}, {}
        for t in self.by_teacher:
            for d in range(DAYS):
                b = [self.busy[(t, d, p)] for p in range(PERIODS)]
                real = [(p, v) for p, v in enumerate(b) if not isinstance(v, int)]
                if not real:
                    continue
                has = m.NewBoolVar(f"th_{t[:6]}_{d}")
                m.AddMaxEquality(has, [v for _, v in real])
                first = m.NewIntVar(0, PERIODS - 1, f"f_{t[:6]}_{d}")
                last = m.NewIntVar(0, PERIODS - 1, f"l_{t[:6]}_{d}")
                for p, v in real:
                    m.Add(first <= p).OnlyEnforceIf(v)
                    m.Add(last >= p).OnlyEnforceIf(v)
                m.Add(last >= first)
                cnt = sum(v for _, v in real)
                win = m.NewIntVar(0, PERIODS, f"w_{t[:6]}_{d}")
                m.Add(win >= last - first + 1 - cnt - PERIODS * (1 - has))
                self.first[(t, d)], self.last[(t, d)], self.tcount[(t, d)] = first, last, cnt
                if t in self.p.no_window_teachers:
                    # окно запрещено; недоступные слоты (занятия ДО) окном не считаются
                    av = self.s.availability[t][d]
                    for p1 in range(PERIODS):
                        for p2 in range(p1 + 1, PERIODS):
                            for p3 in range(p2 + 1, PERIODS):
                                if not av[p2] or isinstance(b[p1], int) or isinstance(b[p3], int):
                                    continue
                                m.Add(b[p1] + b[p3] - b[p2] <= 1)
                if t == BABICH and self.p.babich:
                    self.babich_win = getattr(self, "babich_win", {})
                    self.babich_win[d] = win
                else:
                    w = self.p.window_low if t in self.p.window_low_teachers else self.p.window
                    self.pen("window", w, win)

    def _sanpin(self):
        s, m = self.s, self.m
        for c, mis in self.by_class.items():
            curve = list(self.p.primary_curve) if (self.p.primary_curve and grade_of(c) <= 4) else list(self.p.upper_curve)
            tot_curve = sum(curve)
            factor = self.p.class10_factor if (self.p.babich and c == "10А") else 1
            wmeet = {}
            for mi in mis:
                wmeet[mi] = max(s.subject_weight[(c, sj)] for sj in s.meetings[mi].class_subjects(c))
            week_total = sum(wmeet.values())
            for d in range(DAYS):
                daily = sum(wmeet[mi] * v for mi in mis for (i, dd, p), v in self._x_of(mi) if dd == d)
                target = round(week_total * curve[d] / tot_curve)
                dev = m.NewIntVar(0, 200, f"sp_{c}_{d}")
                m.Add(dev >= daily - target - self.p.sanpin_tol)
                m.Add(dev >= target - daily - self.p.sanpin_tol)
                self.terms.setdefault("sanpin", []).append((self.p.sanpin * factor, dev, "points"))
            # позиция урока в дне
            pos_terms = []
            for mi in mis:
                w = wmeet[mi]
                for (i, d, p), v in self._x_of(mi):
                    cost = 0
                    if self.p.sanpin_graded:
                        # лучшее время трудного урока — 2–4 уроки; штраф растёт с трудностью предмета
                        if w >= 7:
                            f = {0: 0.1, 4: 0.4, 5: 0.8, 6: 1.2, 7: 1.6}.get(p, 0)  # 1-й урок — лёгкий штраф
                            if d == 4 and p >= 4:
                                f += 0.5
                            cost = round(w * f)
                        elif w <= 4 and p in (1, 2, 3):
                            cost = 2
                        if (p == 0 and grade_of(c) >= 5 and s.meetings[mi].class_subjects(c) & LIGHT_FIRST
                                and c not in self.p.natural_exempt_classes):
                            if self.p.light_first_hard and c not in self.p.light_first_soft_classes:
                                m.Add(v == 0)  # музыка/ИЗО/труд первым уроком у 5–11 — нельзя
                            elif self.p.light_first_points:
                                cost += self.p.light_first_points
                    elif w >= 9:
                        cost = {0: 2, 4: 4, 5: 8, 6: 12, 7: 16}.get(p, 0)
                        if d == 4 and p >= 4:
                            cost += 6
                    elif w <= 4 and p in (1, 2, 3):
                        cost = 2
                    if cost:
                        pos_terms.append(cost * v)
            if pos_terms:
                self.terms.setdefault("sanpin", []).append((self.p.sanpin * factor, sum(pos_terms), "points"))

    def _balance(self):
        m = self.m
        for c in self.by_class:
            factor = self.p.class10_factor if (self.p.babich and c == "10А") else 1
            counts = []
            for d in range(DAYS):
                cnt = m.NewIntVar(0, PERIODS, f"cnt_{c}_{d}")
                m.Add(cnt == sum(self.occ[(c, d, p)] for p in range(PERIODS)))
                counts.append(cnt)
            mx = m.NewIntVar(0, PERIODS, f"mx_{c}")
            mn = m.NewIntVar(0, PERIODS, f"mn_{c}")
            m.AddMaxEquality(mx, counts)
            m.AddMinEquality(mn, counts)
            if c in self.p.balanced_hard:
                m.Add(mx - mn <= 1)
            self.pen("load_balance", self.p.load_balance * factor, mx - mn)

    def _alternation(self):
        s, m = self.s, self.m
        for c in s.classes:
            has_day = {}

            def has(subj, d):
                key = (subj, d)
                if key not in has_day:
                    mis = self.cs_meetings.get((c, subj), [])
                    vs = [v for mi in mis for (i, dd, p), v in self._x_of(mi) if dd == d]
                    if vs:
                        b = m.NewBoolVar(f"hs_{c}_{subj[:5]}_{d}")
                        m.AddMaxEquality(b, vs)
                        has_day[key] = b
                    else:
                        has_day[key] = None
                return has_day[key]

            for group in s.related_groups:
                present = [sj for sj in group if (c, sj) in self.cs_meetings]
                if len(present) < 2:
                    continue
                for i, a in enumerate(present):
                    for b in present[i + 1:]:
                        for d in range(DAYS):
                            ha, hb = has(a, d), has(b, d)
                            if ha is not None and hb is not None:
                                self.pen("alternation", self.p.alternation, self.bool_and(ha, hb, "ab"))
                for sj in present:
                    for d in range(DAYS - 1):
                        h1, h2 = has(sj, d), has(sj, d + 1)
                        if h1 is not None and h2 is not None:
                            self.pen("alternation", self.p.alternation, self.bool_and(h1, h2, "rep"))

    def _babich(self):
        s, m, P = self.s, self.m, self.p
        if BABICH not in self.by_teacher:
            return
        # окно Бабича → английский Алекпаровой (9Б/10А) в его кабинете
        self.babich_w = {}
        alek_sections = []
        for mi, mt in enumerate(s.meetings):
            for si, sec in enumerate(mt.sections):
                if sec.teacher == ALEKPAROVA and (mi, si, BABICH_ROOM) in self.r:
                    alek_sections.append((mi, si))
        for d in range(DAYS):
            b = [self.busy[(BABICH, d, p)] for p in range(PERIODS)]
            wins = []
            for p in range(1, PERIODS - 1):
                before = [v for v in b[:p] if not isinstance(v, int)]
                after = [v for v in b[p + 1:] if not isinstance(v, int)]
                if not before or not after or isinstance(b[p], int):
                    continue
                hb = m.NewBoolVar(f"bb{d}{p}")
                ha = m.NewBoolVar(f"ba{d}{p}")
                m.AddMaxEquality(hb, before)
                m.AddMaxEquality(ha, after)
                w = m.NewBoolVar(f"bw{d}{p}")
                m.Add(w <= hb)
                m.Add(w <= ha)
                m.Add(w + b[p] <= 1)
                m.Add(w >= hb + ha - b[p] - 1)
                wins.append(w)
                self.babich_w[(d, p)] = w
                zs = []
                for mi, si in alek_sections:
                    if (mi, d, p) in self.x:
                        zs.append(self.bool_and(self.x[(mi, d, p)], self.r[(mi, si, BABICH_ROOM)], "z"))
                cover = sum(zs) if zs else 0
                if P.babich_window_english_hard:
                    m.Add(w <= cover)
                else:
                    unc = m.NewBoolVar(f"bu{d}{p}")
                    m.Add(unc >= w - cover)
                    self.pen("babich_window_english", P.babich_window_english, unc)
                if P.babich_window_english_bonus and zs:
                    cov = m.NewBoolVar(f"bc{d}{p}")
                    m.Add(cov <= w)
                    m.Add(cov <= cover)
                    self.pen("babich_window_english_bonus", -P.babich_window_english_bonus, cov)
            if d in getattr(self, "babich_win", {}):
                ex = m.NewIntVar(0, PERIODS, f"bex{d}")
                m.Add(ex >= self.babich_win[d] - P.babich_free_windows_per_day)
                self.pen("babich_extra_window", P.babich_extra_window, ex)
            if (BABICH, d) in self.last:
                over = m.NewIntVar(0, PERIODS, f"bover{d}")
                m.Add(over >= self.last[(BABICH, d)] - (P.babich_finish_lesson - 1))
                self.pen("babich_late", P.babich_late, over)
        for d, period in P.babich_windows_at:
            w = self.babich_w.get((d, period - 1))
            if w is None:
                raise ValueError(f"Окно Бабича невозможно: день {d}, урок {period}")
            m.Add(w == 1)
        if P.alia_all_in_babich_windows:
            for mi, si in alek_sections:
                m.Add(self.r[(mi, si, BABICH_ROOM)] == 1)
                for (i, d, p), xv in self._x_of(mi):
                    w = self.babich_w.get((d, p))
                    m.Add(xv <= (w if w is not None else 0))
        # химия во время уроков Бабича = свап кабинетами; на геометрии Вт/Чт — допустимо
        chem = self.krasn_chem
        geo = [mi for mi in self.by_teacher[BABICH]
               if any("Геометрия" in sec.subjects for sec in s.meetings[mi].sections)]
        other = [mi for mi in self.by_teacher[BABICH] if mi not in geo]
        for d in range(DAYS):
            for p in range(PERIODS):
                ch = self._occ_sub(chem, d, p)
                if isinstance(ch, int):
                    continue
                chv = self.eq_bool(ch, "ch")
                ok_geo = d in (1, 3)
                g = self._occ_sub(geo, d, p)
                o = self._occ_sub(other if ok_geo else other + geo, d, p)
                if not isinstance(o, int):
                    self.pen("babich_chem_swap", P.babich_chem_swap, self.bool_and(chv, self.eq_bool(o, "bo"), "sw"))
                if ok_geo and not isinstance(g, int):
                    self.pen("babich_chem_swap_geo", max(1, P.babich_chem_swap // 4),
                             self.bool_and(chv, self.eq_bool(g, "bg"), "swg"))

    # ---------- objective / solve ----------
    def objective(self):
        obj = []
        for key, items in self.terms.items():
            for it in items:
                w, e = it[0], it[1]
                if len(it) == 3:  # баллы СанПиН
                    obj.append(w * e)
                else:
                    obj.append(w * SANPIN_POINTS_PER_UNIT * e)
        self.m.Minimize(sum(obj))

    def solve(self, hint: dict | None = None, log_path=None, feasibility_only=False,
              on_solution=None, snapshot_every=0.0, stop_file=None):
        if not feasibility_only:
            self.objective()
        if hint:
            placed = {int(mi): tuple(dp) for mi, dp in hint.get("slots", {}).items()}
            hrooms = dict(hint.get("rooms", {}))
            for mis in self.sym_groups:
                order = sorted(mis, key=lambda i: placed[i][0] * PERIODS + placed[i][1])
                slots_sorted = [placed[i] for i in order]
                rooms_sorted = [{si: hrooms.get(f"{i}|{si}") for si in range(len(self.s.meetings[i].sections))}
                                for i in order]
                for i, sl, rm in zip(mis, slots_sorted, rooms_sorted):
                    placed[i] = sl
                    for si, rid in rm.items():
                        hrooms[f"{i}|{si}"] = rid
            for (mi, d, p), v in self.x.items():
                self.m.AddHint(v, 1 if placed.get(mi) == (d, p) else 0)
            for (mi, si, rid), v in self.r.items():
                self.m.AddHint(v, 1 if hrooms.get(f"{mi}|{si}") == rid else 0)
        solver = cp_model.CpSolver()
        if hint:
            solver.parameters.repair_hint = True
            solver.parameters.hint_conflict_limit = 1000
        solver.parameters.max_time_in_seconds = float(self.p.time_limit)
        solver.parameters.num_workers = 12
        solver.parameters.random_seed = self.p.seed
        solver.parameters.log_search_progress = log_path is not None
        if log_path:
            f = open(log_path, "w", encoding="utf-8")
            solver.log_callback = lambda line: (f.write(line + "\n"), f.flush())
        t0 = time.time()
        cb = None
        if on_solution:
            # Каждое улучшение отдаём наружу, чтобы решение не терялось, если расчёт прервут.
            # snapshot_every > 0 прореживает запись, но тогда последнее улучшение может не попасть в файл.
            outer = self

            class _Snap(cp_model.CpSolverSolutionCallback):
                def __init__(self):
                    super().__init__()
                    self.last = 0.0

                def on_solution_callback(self):
                    now = time.time()
                    if now - self.last < snapshot_every:
                        return
                    self.last = now
                    on_solution(outer._extract(self.Value, "FEASIBLE", now - t0,
                                               self.ObjectiveValue(), self.BestObjectiveBound()))
            cb = _Snap()
        stopper = None
        if stop_file:
            # Досрочная остановка: появился файл — солвер заканчивает с лучшим найденным решением.
            import threading
            done = threading.Event()

            def _watch():
                while not done.wait(1.0):
                    if os.path.exists(stop_file):
                        solver.StopSearch()
                        return
            stopper = threading.Thread(target=_watch, daemon=True)
            stopper.start()
        status = solver.Solve(self.m, cb) if cb else solver.Solve(self.m)
        if stopper:
            done.set()
        wall = time.time() - t0
        st = solver.StatusName(status)
        if st not in ("OPTIMAL", "FEASIBLE"):
            return {"status": st, "wall_sec": round(wall, 1)}
        return self._extract(solver.Value, st, wall, solver.ObjectiveValue(), solver.BestObjectiveBound())

    def _extract(self, value, st, wall, objective, bound):
        slots = {}
        rooms = {}
        for (mi, d, p), v in self.x.items():
            if value(v):
                slots[mi] = (d, p)
        for mi, mt in enumerate(self.s.meetings):
            for si, sec in enumerate(mt.sections):
                if len(sec.rooms) == 1:
                    rooms[(mi, si)] = sec.rooms[0]
                else:
                    rooms[(mi, si)] = next(r for r in sec.rooms if value(self.r[(mi, si, r)]))
        breakdown = {}
        for key, items in self.terms.items():
            units = sum(value(it[1]) if not isinstance(it[1], int) else it[1] for it in items)
            cost = sum((it[0] if len(it) == 3 else it[0] * SANPIN_POINTS_PER_UNIT) *
                       (value(it[1]) if not isinstance(it[1], int) else it[1]) for it in items)
            breakdown[key] = {"units": int(units), "cost": int(cost)}
        return {
            "status": st,
            "wall_sec": round(wall, 1),
            "objective": int(objective),
            "bound": int(bound),
            "slots": {str(k): list(v) for k, v in slots.items()},
            "rooms": {f"{k[0]}|{k[1]}": v for k, v in rooms.items()},
            "breakdown": breakdown,
            "relaxed_daily": self.relaxed_daily,
        }

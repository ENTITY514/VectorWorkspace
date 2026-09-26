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
    gym_small_days: dict = field(default_factory=dict)  # класс → дни, когда ему можно в малый зал (со штрафом gym)
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
    # 25.09: окна и удобство учителей
    window_weights: dict = field(default_factory=dict)  # учитель → свой вес окна (вместо window / window_low)
    start_first_teachers: tuple = ()       # приходят к 1-му уроку (кл. руководители): ожидание до урока — тоже окно
    double_window: int = 0                 # штраф за каждые 2 окна подряд (сверх штрафа за сами окна)
    no_double_window_teachers: tuple = ()  # у них 2 окна подряд — запрещено
    double_window_weights: dict = field(default_factory=dict)  # учитель → свой штраф за 2 окна подряд
    window_excess_over: int = 3            # окон в неделю у учителя без доп. штрафа
    window_excess: int = 0                 # штраф за каждое окно сверх window_excess_over
    single_lesson_day: int = 0             # учитель приходит ради одного урока
    window_caps: dict = field(default_factory=dict)  # учитель → жёсткий предел окон в неделю
    luo_student_window: int = 0            # окно у ученика ЛУО на инклюзии (luo_inclusion.json)
    luo_student_max_windows_day: int | None = None  # жёсткий предел окон ученика ЛУО в день
    luo_student_max_windows_week: int | None = None  # жёсткий предел окон ученика ЛУО в неделю
    luo_student_start_first: bool = False  # ученик ЛУО приходит к 1-му уроку вместе с классом (жёстко)
    luo_student_last_max: int | None = None  # последний урок ученика ЛУО — не позже этого (1..8, жёстко)
    luo_student_late: dict = field(default_factory=dict)  # номер урока → штраф, если ученик ЛУО на нём ещё в школе
    history_alternation: bool = False      # всемирная история — между двумя уроками истории Казахстана
    heavy_triple: int = 0                  # 5–11: три трудных урока (≥9 баллов) подряд
    heavy_late: int = 0                    # 5–11: трудный урок (≥9 баллов) на 6-м уроке и позже — доп. штраф
    alternate_groups: tuple = ()           # группы парных предметов: между двумя уроками одного — урок другого
    alternate_weight: int = 0
    sanpin_cap: int | None = None          # жёсткий предел баллов СанПиН (с множителем 10А), не хуже базовой версии
    sanpin_cap_weight: int = 0             # > 0 — потолок мягкий: штраф за каждый балл сверх sanpin_cap
    teacher_days_exact: dict = field(default_factory=dict)  # учитель → (рабочих дней, уроков в каждый из них)
    teacher_min_per_day: dict = field(default_factory=dict)  # учитель → минимум уроков в рабочий день (жёстко)
    teacher_busy_fixed: dict = field(default_factory=dict)  # учитель → {день: [0/1 по урокам]} — окна на месте
    start_first_hard: tuple = ()           # в каждый рабочий день начинают с 1-го урока (жёстко)
    teacher_day_band: dict = field(default_factory=dict)    # учитель → (мин, макс) уроков в рабочий день (мягко)
    teacher_day_band_weight: int = 0
    teacher_late_periods: dict = field(default_factory=dict)  # учитель → номера уроков (1..8), нежелательные
    teacher_late_weight: int = 0
    teacher_extra_day: int = 0             # рабочий день сверх ceil(уроков / 5) — учитель «размазан» по неделе
    low_load_max: int = 12                 # учителя с нагрузкой до стольких часов …
    low_load_per_day: int = 4              # … должны укладываться в ceil(часы / это) рабочих дней
    low_load_extra_day: int = 0            # штраф за каждый рабочий день сверх этого
    gym_prefer_big: tuple = ()             # маленькие классы, которым по возможности — большой зал
    gym_prefer_big_weight: int = 0
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
        self._normalize_symmetric()

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
        if (self.p.luo_student_window or self.p.luo_student_max_windows_day is not None
                or self.p.luo_student_max_windows_week is not None or self.p.luo_student_start_first):
            self._luo_students()
        if self.p.history_alternation:
            self._history_alternation()
        if self.p.alternate_groups and self.p.alternate_weight:
            self._weekly_alternation()
        if self.p.heavy_triple or self.p.heavy_late:
            self._child_view()
        if self.p.sanpin_cap is not None:
            pts = sum((it[0] // self.p.sanpin) * it[1] for it in self.terms.get("sanpin", []))
            if self.p.sanpin_cap_weight:
                over = m.NewIntVar(0, 100000, "sanpin_over")
                m.Add(over >= pts - self.p.sanpin_cap)
                self.pen("sanpin_over_cap", self.p.sanpin_cap_weight, over)
            else:
                m.Add(pts <= self.p.sanpin_cap)
        return self

    @staticmethod
    def symmetric_groups(school):
        """Одинаковые уроки (учитель, состав, кабинеты) — взаимозаменяемы; модель ставит их по возрастанию номера."""
        groups: dict[tuple, list[int]] = {}
        for mi, mt in enumerate(school.meetings):
            sig = tuple(sorted((sec.teacher, tuple(sorted(sec.attendees, key=str)), tuple(sec.rooms))
                               for sec in mt.sections))
            groups.setdefault(sig, []).append(mi)
        return [mis for mis in groups.values() if len(mis) > 1]

    def _normalize_symmetric(self):
        """Слоты прежних версий могли стоять в другом порядке внутри группы одинаковых уроков —
        переставляем их по времени, иначе закрепление невыполнимо, а «сдвиги» мнимые."""
        for attr in ("fixed_slots", "keep_slots", "base_slots"):
            slots = dict(getattr(self.p, attr))
            if not slots:
                continue
            for mis in self.symmetric_groups(self.s):
                have = [mi for mi in mis if mi in slots]
                if len(have) < 2:
                    continue
                ordered = sorted((slots[mi] for mi in have), key=lambda dp: dp[0] * PERIODS + dp[1])
                for mi, dp in zip(have, ordered):
                    slots[mi] = tuple(dp)
            setattr(self.p, attr, slots)

    def luo_attendance(self):
        """Ученики ЛУО на инклюзии: (ученик, класс, уроки всегда, [(уроки на выбор, сколько посещает)])."""
        from dataset import load
        out = []
        for st in load("luo_inclusion.json").get("students", []):
            c = st["host_class"]
            always, choice = [], []
            for e in st["map"]:
                subs = set(e.get("class_subjects") or [e["class_subject"]])
                mis = [mi for mi in self.by_class.get(c, []) if self.s.meetings[mi].class_subjects(c) & subs]
                if e["attends"] >= len(mis):
                    always += mis
                elif e["attends"] > 0:
                    choice.append((mis, e["attends"]))
            out.append((st["student"], c, always, choice))
        return out

    def _luo_students(self):
        """Окна ученика ЛУО: уроки класса, которые он не посещает, между посещаемыми."""
        m = self.m
        self.luo_choice = {}
        for name, c, always, choice in self.luo_attendance():
            tag = name.split()[-1][:4]
            pick = {}
            for mis, n in choice:
                vs = [m.NewBoolVar(f"luo_{tag}_{mi}") for mi in mis]
                m.Add(sum(vs) == n)
                pick.update(zip(mis, vs))
            self.luo_choice[name] = pick
            week = []
            for d in range(DAYS):
                pres = []
                for p in range(PERIODS):
                    terms = [self.x[(mi, d, p)] for mi in always if (mi, d, p) in self.x]
                    for mi, a in pick.items():
                        if (mi, d, p) in self.x:
                            terms.append(self.bool_and(self.x[(mi, d, p)], a, "luoc"))
                    pres.append(self.eq_bool(sum(terms), f"lp_{tag}_{d}{p}") if terms else 0)
                real = [(p, v) for p, v in enumerate(pres) if not isinstance(v, int)]
                if not real:
                    continue
                has = m.NewBoolVar(f"lh_{tag}_{d}")
                m.AddMaxEquality(has, [v for _, v in real])
                first = m.NewIntVar(0, PERIODS - 1, f"lf_{tag}_{d}")
                last = m.NewIntVar(0, PERIODS - 1, f"ll_{tag}_{d}")
                for p, v in real:
                    m.Add(first <= p).OnlyEnforceIf(v)
                    m.Add(last >= p).OnlyEnforceIf(v)
                win = m.NewIntVar(0, PERIODS, f"lw_{tag}_{d}")
                m.Add(win >= last - first + 1 - sum(v for _, v in real) - PERIODS * (1 - has))
                if self.p.luo_student_max_windows_day is not None:
                    m.Add(win <= self.p.luo_student_max_windows_day)
                if self.p.luo_student_start_first:
                    # first ограничен только сверху — требуем сам урок: в любой учебный день ученик на 1-м уроке
                    m.Add(pres[0] >= has) if not isinstance(pres[0], int) else m.Add(has == 0)
                if self.p.luo_student_last_max is not None:
                    m.Add(last <= self.p.luo_student_last_max - 1).OnlyEnforceIf(has)
                for per, w in self.p.luo_student_late.items():
                    if not isinstance(pres[per - 1], int):
                        self.pen("luo_student_late", w, pres[per - 1])
                self.pen("luo_student_window", self.p.luo_student_window, win)
                week.append(win)
            if self.p.luo_student_max_windows_week is not None and week:
                m.Add(sum(week) <= self.p.luo_student_max_windows_week)

    def _child_view(self):
        """Глазами ребёнка (5–11): не три трудных подряд, трудные — не в конце дня."""
        s, m = self.s, self.m
        for c, mis in self.by_class.items():
            if grade_of(c) <= 4:
                continue
            heavy = [mi for mi in mis if max(s.subject_weight[(c, sj)] for sj in s.meetings[mi].class_subjects(c)) >= 9]
            for d in range(DAYS):
                h = [self._occ_sub(heavy, d, p) for p in range(PERIODS)]
                if self.p.heavy_late:
                    for p in range(5, PERIODS):
                        if not isinstance(h[p], int):
                            self.pen("heavy_late", self.p.heavy_late, h[p])
                if self.p.heavy_triple:
                    for p in range(PERIODS - 2):
                        if any(isinstance(h[q], int) for q in (p, p + 1, p + 2)):
                            continue
                        tr = m.NewBoolVar(f"h3_{c}_{d}{p}")
                        m.Add(tr >= h[p] + h[p + 1] + h[p + 2] - 2)
                        self.pen("heavy_triple", self.p.heavy_triple, tr)

    def _weekly_alternation(self):
        """5–11 классы: по неделе парные предметы чередуются (А Б А …), а не идут А А Б."""
        m = self.m
        sym_of = {}
        for mis in self.sym_groups:
            for mi in mis:
                sym_of[mi] = tuple(mis)
        for c in self.s.classes:
            if grade_of(c) <= 4:
                continue
            for group in self.p.alternate_groups:
                present = {sj: self.cs_meetings.get((c, sj), []) for sj in group}
                present = {sj: mis for sj, mis in present.items() if mis}
                if len(present) < 2:
                    continue
                for sj, mis in present.items():
                    if len(mis) < 2 or len({sym_of.get(mi) for mi in mis}) != 1 or mis[0] not in sym_of:
                        continue  # порядок уроков предмета известен только для одинаковых уроков
                    others = [mi for o, oms in present.items() if o != sj for mi in oms]
                    for a, b in zip(mis, mis[1:]):
                        betw = []
                        for o in others:
                            z = m.NewBoolVar(f"alt_{c}_{a}_{o}")
                            m.Add(self.t[o] > self.t[a]).OnlyEnforceIf(z)
                            m.Add(self.t[o] < self.t[b]).OnlyEnforceIf(z)
                            betw.append(z)
                        miss = m.NewBoolVar(f"altm_{c}_{a}")
                        m.Add(sum(betw) + miss >= 1)
                        self.pen("weekly_alternation", self.p.alternate_weight, miss)

    def _history_alternation(self):
        """История Казахстана и всемирная история по неделе чередуются: ИК … ВИ … ИК."""
        m = self.m
        for c in self.s.classes:
            ik = self.cs_meetings.get((c, "История Казахстана"), [])
            wh = self.cs_meetings.get((c, "Всемирная история"), [])
            if len(ik) == 2 and len(wh) == 1:
                a, b, v = ik[0], ik[1], wh[0]
            elif len(wh) == 2 and len(ik) == 1:
                a, b, v = wh[0], wh[1], ik[0]
            else:
                continue
            lo = m.NewBoolVar(f"hal_{c}")  # a раньше b
            m.Add(self.t[a] < self.t[v]).OnlyEnforceIf(lo)
            m.Add(self.t[v] < self.t[b]).OnlyEnforceIf(lo)
            m.Add(self.t[b] < self.t[v]).OnlyEnforceIf(lo.Not())
            m.Add(self.t[v] < self.t[a]).OnlyEnforceIf(lo.Not())

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
                        if rid != BIG_GYM and set(mt.classes) & set(self.p.gym_prefer_big):
                            self.pen("gym_prefer_big", self.p.gym_prefer_big_weight, v)
                        if rid not in sec.preferred_rooms:
                            hard = set(mt.classes) & set(self.p.gym_hard_classes)
                            ok_days = (set.intersection(*[set(self.p.gym_small_days.get(c, ())) for c in hard])
                                       if hard else set())
                            if hard and not ok_days:
                                m.Add(v == 0)  # этим классам — только свой зал
                            else:
                                for (i, d, p), xv in self._x_of(mi):
                                    if hard and d not in ok_days:
                                        m.Add(xv + v <= 1)  # в малый зал — только в разрешённые дни
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
        self.twin: dict[str, list] = {}
        self.thas: dict[tuple, cp_model.IntVar] = {}
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
                if t in self.p.start_first_teachers:
                    m.Add(win >= last + 1 - cnt - PERIODS * (1 - has))  # пришла к 1-му уроку и ждёт
                self.first[(t, d)], self.last[(t, d)], self.tcount[(t, d)] = first, last, cnt
                self.twin.setdefault(t, []).append(win)
                self.thas[(t, d)] = has
                if self.p.single_lesson_day:
                    one = m.NewBoolVar(f"one_{t[:6]}_{d}")
                    m.Add(one >= has - (cnt - 1))
                    self.pen("single_lesson_day", self.p.single_lesson_day, one)
                if self.p.double_window or t in self.p.no_double_window_teachers or t in self.p.double_window_weights:
                    self._double_windows(t, d, b)
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
                    self.pen("window", self.p.window_weights.get(t, w), win)
        for t, cap in self.p.window_caps.items():
            if t in self.twin:
                m.Add(sum(self.twin[t]) <= cap)
        if self.p.window_excess:
            for t, wins in self.twin.items():
                if t == BABICH or t in self.p.window_low_teachers:
                    continue
                # прогрессивно: 1-е окно сверх предела ×1, 2-е ×2, 3-е ×3 …
                for k in range(1, 9):
                    ex = m.NewIntVar(0, DAYS * PERIODS, f"wex_{t[:6]}_{k}")
                    m.Add(ex >= sum(wins) - self.p.window_excess_over - (k - 1))
                    self.pen("window_excess", self.p.window_excess, ex)
        self._teacher_extras()

    def _teacher_extras(self):
        m, P = self.m, self.p
        for t, (nd, per) in P.teacher_days_exact.items():
            hs = [self.thas[(t, d)] for d in range(DAYS) if (t, d) in self.thas]
            m.Add(sum(hs) == nd)
            for d in range(DAYS):
                if (t, d) in self.thas and per:
                    m.Add(self.tcount[(t, d)] == per * self.thas[(t, d)])
        for t, k in P.teacher_min_per_day.items():
            for d in range(DAYS):
                if (t, d) in self.thas:
                    m.Add(self.tcount[(t, d)] >= k * self.thas[(t, d)])
        for t, days in P.teacher_busy_fixed.items():
            for d, pattern in days.items():
                for p in range(PERIODS):
                    b = self.busy.get((t, d, p), 0)
                    want = pattern[p] if p < len(pattern) else 0
                    if isinstance(b, int):
                        if b != want:
                            raise ValueError(f"Нельзя сохранить сетку {t}: {d},{p}")
                    else:
                        m.Add(b == want)
        for t in P.start_first_hard:
            for d in range(DAYS):
                if (t, d) in self.thas:
                    b0 = self.busy.get((t, d, 0), 0)
                    m.Add(b0 >= self.thas[(t, d)])
        for t, (lo, hi) in P.teacher_day_band.items():
            for d in range(DAYS):
                if (t, d) not in self.thas:
                    continue
                h, cnt = self.thas[(t, d)], self.tcount[(t, d)]
                under = m.NewIntVar(0, PERIODS, f"bu_{t[:5]}_{d}")
                over = m.NewIntVar(0, PERIODS, f"bo_{t[:5]}_{d}")
                m.Add(under >= lo * h - cnt)
                m.Add(over >= cnt - hi)
                self.pen("teacher_day_band", P.teacher_day_band_weight, under + over)
        for t, periods in P.teacher_late_periods.items():
            for d in range(DAYS):
                for per in periods:
                    b = self.busy.get((t, d, per - 1), 0)
                    if not isinstance(b, int):
                        self.pen("teacher_late", P.teacher_late_weight, b)
        if P.low_load_extra_day:
            for t, mis in self.by_teacher.items():
                if len(mis) > P.low_load_max:
                    continue
                hs = [self.thas[(t, d)] for d in range(DAYS) if (t, d) in self.thas]
                need = max(1, math.ceil(len(mis) / P.low_load_per_day))
                if len(hs) > need:
                    ex = m.NewIntVar(0, DAYS, f"lx_{t[:6]}")
                    m.Add(ex >= sum(hs) - need)
                    self.pen("low_load_extra_day", P.low_load_extra_day, ex)
        if P.teacher_extra_day:
            for t, mis in self.by_teacher.items():
                hs = [self.thas[(t, d)] for d in range(DAYS) if (t, d) in self.thas]
                need = max(1, math.ceil(len(mis) / 5))
                if len(hs) > need:
                    ex = m.NewIntVar(0, DAYS, f"xd_{t[:6]}")
                    m.Add(ex >= sum(hs) - need)
                    self.pen("teacher_extra_day", P.teacher_extra_day, ex)

    def _or_chain(self, vals, name):
        """pre[i] = есть ли 1 среди vals[:i] (pre[0] = 0)."""
        pre = [0]
        for i, v in enumerate(vals):
            prev = pre[-1]
            if any(isinstance(x, int) and x == 1 for x in (prev, v)):
                pre.append(1)
                continue
            items = [x for x in (prev, v) if not isinstance(x, int)]
            if len(items) <= 1:
                pre.append(items[0] if items else 0)
                continue
            o = self.m.NewBoolVar(f"{name}{i}")
            self.m.AddMaxEquality(o, items)
            pre.append(o)
        return pre

    def _double_windows(self, t, d, b):
        """Два окна подряд: уроки p и p+1 свободны, а до и после них есть уроки."""
        m = self.m
        av = self.s.availability[t][d]
        pre = self._or_chain(b, f"dp_{t[:5]}_{d}_")
        suf = self._or_chain(b[::-1], f"ds_{t[:5]}_{d}_")[::-1]  # suf[i] — есть ли урок в b[i:]
        for p in range(1, PERIODS - 2):
            if not (av[p] and av[p + 1]):
                continue  # занятия ДО / недоступность окном не считаются
            before, after = pre[p], suf[p + 2]
            if isinstance(before, int) and before == 0 or isinstance(after, int) and after == 0:
                continue
            expr = before + after - b[p] - b[p + 1] - 1
            if t in self.p.no_double_window_teachers:
                m.Add(expr <= 0)
            elif t != BABICH and self.p.double_window_weights.get(t, self.p.double_window):
                dw = m.NewBoolVar(f"dw_{t[:5]}_{d}{p}")
                m.Add(dw >= expr)
                self.pen("double_window", self.p.double_window_weights.get(t, self.p.double_window), dw)

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

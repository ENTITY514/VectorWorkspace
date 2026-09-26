"""Генерация вариантов расписания.

  python run_variants.py solve V1 V2 ...   — посчитать варианты (подсказка — лучший уже найденный)
  python run_variants.py export            — выгрузить все посчитанные варианты в Excel
  python run_variants.py import            — записать данные и варианты в базу программы
"""
from __future__ import annotations

import json
import sys

from dataset import ALEKPAROVA, BABICH, BABICH_ROOM, ROOT, build
from model import Built, Profile
from verify import metrics, verify

HIDE_PERSONAL = True  # не выносить в отчёты личные настройки (окна, кабинет, английский в окнах)
OUT = ROOT / "data" / "bilimclass" / "output"
XLSX_DIR = ROOT / "Materials" / "Расписание 2026-2027"

PROFILES = {
    "V1": Profile("V1", "Рекомендуемый (Бабич + 10А)",
                  description="Все жёсткие правила; веса по согласованной таблице; персональные правила Бабича "
                              "(окно ↔ английский 9Б/10А в каб. 17 — 300, свапы с химией — 120, ≤1 окна в день, "
                              "уход после 5-го урока); 10А — удвоенный вес СанПиН и баланса."),
    "V2": Profile("V2", "Версия 2 (окна Бабича под английский)",
                  babich_finish_lesson=6, babich_window_english_bonus=2000,
                  primary_start_hard=True, late_start_upper=800,
                  no_window_teachers=("Пащенко Наталья Аркадьевна",),
                  description="Как V1, плюс: окна Бабича специально создаются под английский Алекпаровой 9Б/10А "
                              "в каб.17 (бонус 2000 за каждое, ≤1 окна в день); Бабич без штрафа до 6-го урока; "
                              "у Пащенко Н.А. окон нет (жёстко); 1–4 классы всегда с 1-го урока (жёстко); "
                              "поздний старт 5–11 классов — штраф 800."),
    "V3": Profile("V3", "Версия 3 (все с 1-го урока)",
                  babich_finish_lesson=6, babich_window_english_bonus=2000,
                  primary_start_hard=True, late_start_upper=800,
                  no_window_teachers=("Пащенко Наталья Аркадьевна",),
                  start_hard_except=("11А",), balanced_hard=("1Б",), gym=800,
                  description="Как V2, плюс: все классы начинают с 1-го урока (жёстко; исключение — 11А); "
                              "у 1Б разница уроков между днями не больше 1 (жёстко); физкультура — большой зал, "
                              "маленькие классы (до 8 детей на уроке) — малый зал (штраф 800); Ажикенова занята "
                              "только на своих реальных уроках ДО; расписание 10А закреплено как в V2, "
                              "но в четверг география последним (7-м), основы права — 6-м."),
}

_V3_BASE = dict(babich_finish_lesson=6, babich_window_english_bonus=2000, primary_start_hard=True,
                late_start_upper=800, start_hard_except=("11А",), balanced_hard=("1Б",), gym=800,
                no_window_teachers=("Пащенко Наталья Аркадьевна", "Сидоров Виктор Борисович"),
                primary_lang_limit=800, primary_curve=(8, 11, 6, 11, 8))
_FIXES = ("замечания школы: у 1–4 классов среда облегчённая (кривая СанПиН Пн8/Вт11/Ср6/Чт11/Пт8) и не больше "
          "2 разных языков (рус./каз./англ.) в день (штраф 800); у Сидорова (совместитель) окон нет (жёстко); "
          "у Пащенко окон нет (жёстко)")
WED, THU = 2, 3
PROFILES["V4"] = Profile("V4", "Версия 4 (замечания школы)", **_V3_BASE,
                         description=f"Как V3 (10А закреплён, география в Чт последней) + {_FIXES}.")
PROFILES["V5"] = Profile(
    "V5", "Версия 5 (2 окна Бабича = английский Алии)", **_V3_BASE,
    pins=[
        {"class": "9Б", "subject": "Алгебра", "teacher": "Бабич Иман Денисович", "day": WED, "period": 3},
        {"class": "9Б", "subject": "Иностранный язык", "teacher": "Алекпарова Алия Жумабаевна", "day": WED,
         "period": 4, "room": "room_17"},
        {"class": "10А", "subject": "Иностранный язык", "teacher": "Алекпарова Алия Жумабаевна", "day": THU,
         "period": 3, "room": "room_17"},
        {"class": "10А", "subject": "Геометрия", "day": THU, "period": 4},
        {"class": "10А", "subject": "Алгебра и начала анализа", "day": THU, "period": 5},
        {"class": "10А", "subject": "География", "day": THU, "period": 7},
    ],
    babich_windows_at=[(WED, 4), (THU, 3)],
    math_one_later_teachers=("Бабич Иман Денисович",),
    description=f"Как V4, но 10А не закреплён целиком. Жёстко: Ср — 3 урок алгебра 9Б (Бабич), 4 урок английский "
                f"9Б у Алекпаровой в каб.17, у Бабича окно; Чт — 3 урок английский 10А у Алекпаровой в каб.17 "
                f"(у Бабича окно), 4 геометрия 10А, 5 алгебра 10А; география 10А в Чт — 7-м уроком. "
                f"Математика Бабича разрешена на 1 урок позже (Вт–Чт до 6-го, Пн/Пт до 5-го): иначе с 2 окнами "
                f"все 23 допустимых слота Бабича заняты, и правило «Вт — только геометрия» не выполнить. {_FIXES}.")
PROFILES["V6"] = Profile(
    "V6", "Версия 6 (весь английский Алии 9Б-10А в окнах Бабича)", **_V3_BASE,
    alia_all_in_babich_windows=True, babich_free_windows_per_day=2,
    math_one_later_teachers=("Бабич Иман Денисович",),
    pins=[{"class": "10А", "subject": "География", "day": THU, "period": 7}],
    description=f"Как V4, но 10А не закреплён целиком. Жёстко: ВСЕ уроки английского Алекпаровой в 9Б и 10А идут "
                f"в окна Бабича в каб.17 (у Бабича допускается до 2 окон в день); география 10А в Чт — 7-м. "
                f"Чтобы это было возможно, математика Бабича разрешена на 1 урок позже (Вт–Чт до 6-го, Пн/Пт до 5-го): "
                f"при прежнем пределе у Бабича 23 допустимых слота на 21 урок — максимум 2 окна. {_FIXES}.")


PROFILES["V7"] = Profile(
    "V7", "Версия 7 (V4 + четверг Бабича с английским Алии)", **_V3_BASE,
    pins=[{"class": "10А", "subject": sj, "day": THU, "period": p, **extra} for sj, p, extra in [
        ("Казахский язык и литература", 1, {}), ("Физическая культура", 2, {}),
        ("Иностранный язык", 3, {"teacher": "Алекпарова Алия Жумабаевна", "room": "room_17"}),
        ("Геометрия", 4, {}), ("Алгебра и начала анализа", 5, {}), ("Основы права", 6, {}), ("География", 7, {})]],
    babich_windows_at=[(THU, 3)],
    math_one_later_teachers=("Бабич Иман Денисович",), math_one_later_days=(THU,),
    change_weight=250,
    description=f"За основу взят V4; каждый урок, сдвинутый относительно V4, штрафуется (250 — дешевле окна учителя), остальные дни 10А "
                f"закреплены как в V4. Четверг 10А жёстко: 1 казахский, 2 физкультура, 3 английский у Алекпаровой в "
                f"каб.17 (у Бабича окно), 4 геометрия, 5 алгебра, 6 основы права, 7 география. Математике Бабича "
                f"разрешён 6-й урок только в четверг. {_FIXES}.")


from import_db import COMBINED  # noqa: E402

PROFILES["V8"] = Profile(
    "V8", "Версия 8 (V7 + совместители без окон)",
    **{**_V3_BASE, "no_window_teachers": tuple(sorted(set(_V3_BASE["no_window_teachers"]) | COMBINED))},
    pins=PROFILES["V7"].pins, babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    change_weight=1000,
    description=f"За основу взят V7 (каждый урок, сдвинутый относительно V7, штрафуется 1000); 10А закреплён как в V7. "
                f"Жёстко: у всех совместителей нет окон ({', '.join(sorted(n.split()[0] for n in COMBINED))}). "
                f"Остальные правила как в V7. {_FIXES}.")
PROFILES["V9"] = Profile(
    "V9", "Версия 9 (V8 + Балташева не в каб. химии)",
    **{**_V3_BASE, "no_window_teachers": PROFILES["V8"].no_window_teachers},
    pins=PROFILES["V7"].pins, babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    change_weight=1000, babich_chem_swap=3000, babich_max_swaps=0,
    description=f"За основу взят V8 (каждый сдвинутый урок штрафуется 1000). 10А закреплён как в V8, кроме Вт и Пт — "
                f"там уроки 10А можно переставлять внутри дня, чтобы химия не шла во время уроков Бабича. Балташева "
                f"(химия 8Ә/11А, совместитель) ведёт уроки в обычных свободных кабинетах, каб. химии не занимает. "
                f"Штраф за свап Бабича с химией Красноперовой поднят до 3000 (на геометрии Вт/Чт — 750). "
                f"Остальные правила как в V8. {_FIXES}.")
TUE, FRI = 1, 4
PROFILES["V10"] = Profile(
    "V10", "Версия 10 (V8 + равномерные 11-е классы)",
    **{**_V3_BASE, "no_window_teachers": PROFILES["V8"].no_window_teachers,
       "balanced_hard": ("1Б", "11А", "11Б")},
    pins=PROFILES["V7"].pins, babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    change_weight=1000,
    description=f"За основу взят V8 (каждый сдвинутый урок штрафуется 1000); 10А закреплён как в V8. Жёстко: у 11А и "
                f"11Б разница уроков между днями не больше 1 (в V8 было 11А 7/6/8/7/4, 11Б 6/8/6/5/5). "
                f"Остальные правила как в V8. {_FIXES}.")
def class_teacher_pins(school):
    """Уроки классных руководителей начальной школы (где бы в 1–4 они ни вели).

    Остальное в началке (языки, музыка, физкультура, информатика) алгоритм расставляет сам:
    именно эти предметники связывают началку со старшими классами.
    """
    from dataset import grade_of, load
    ct = {c["class_teacher"] for c in load("classes.json")["classes"]
          if c["status"] == "active" and grade_of(c["class_name"]) <= 4}
    teacher_of = {(e["class_name"], e["subject_name"]): [t["fio"] for t in e["teachers"]]
                  for e in school.curriculum_entries}
    return [p for p in primary_pins()
            if ct & set(teacher_of.get((p["class"], p["subject"]), []))]


def primary_pins():
    """Закрепление расписания начальных классов по сетке завучей (primary_fixed.json).

    Три урока в сетке отсутствуют и добавлены по согласованию: 2А — казахский вместо второго
    естествознания (Пн, 5 урок), 4А — естествознание (Ср, 5), 4Б — английский (Ср, 6).
    """
    from dataset import DAY_LABELS, load
    pf = load("primary_fixed.json")
    smap = pf["subject_map"]
    pins = []
    for c, days in pf["schedule"].items():
        for dn, lst in days.items():
            for p, ab in enumerate(lst):
                sj = smap[ab]
                if sj in ("ФАКУЛЬТАТИВ", "ИГЗ"):
                    continue
                if c == "3А" and sj == "Иностранный язык":
                    sj = "Английский язык"          # в 3А предмет называется так
                pins.append({"class": c, "subject": sj, "day": DAY_LABELS.index(dn), "period": p + 1})
    return pins


PROFILES["V13"] = Profile(
    "V13", "Версия 13 (началка по сетке завучей)",
    # Жантимиров Э. (информатика, только Вт и Пт) исключён из правила «совместители без окон»:
    # в сетке завучей ЦГ во 2А стоит 1-м уроком, а в 4А 5-м, и закрыть промежуток нечем —
    # два урока информатики в 11А нельзя ставить в один день.
    **{**_V3_BASE, "balanced_hard": ("1Б", "11А", "11Б"),
       "no_window_teachers": tuple(t for t in PROFILES["V8"].no_window_teachers
                                   if not t.startswith("Жантимиров Эльдар"))},
    pins=PROFILES["V7"].pins + primary_pins(),
    babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    change_weight=1000,
    description="За основу взят V12 (каждый сдвинутый урок штрафуется 1000). Расписание 1–4 классов закреплено "
                "по рукописной сетке завучей (primary_fixed.json); добавлены недостающие уроки: 2А — казахский "
                "вместо второго естествознания (Пн, 5), 4А — естествознание (Ср, 5), 4Б — английский (Ср, 6). "
                "Часы по решению школы: 1А математика 4 ч, 2Б и 3А казахский по 2 ч. Физкультура 2А+4А и "
                "5А+6А+8Ә — класс-комплекты, музыка в актовом зале, 9Б +1 ч худ. труда. 10А закреплён как в V12.")
PROFILES["V14"] = Profile(
    "V14", "Версия 14 (началку строит алгоритм)",
    **{**_V3_BASE, "balanced_hard": ("1А", "1Б", "2А", "2Б", "3А", "4А", "4Б", "11А", "11Б"),
       "no_window_teachers": PROFILES["V8"].no_window_teachers},
    pins=PROFILES["V7"].pins, babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    change_weight=1000,
    description="Те же данные и правила, что в V13 (физкультура 2А+4А и 5А+6А+8Ә — класс-комплекты, музыка в "
                "актовом зале, 9Б +1 ч худ. труда, 1А математика 4 ч, 2Б и 3А казахский по 2 ч, естествознание "
                "4А у Жекеевой), но расписание 1–4 классов строит алгоритм, а не берётся из сетки завучей. "
                "За основу взят V12, каждый сдвинутый урок штрафуется; 10А и четверг Бабича закреплены; "
                "у всех совместителей окон нет; 11А и 11Б равномерны по дням.")
PROFILES["V15"] = Profile(
    "V15", "Версия 15 (в началке закреплены дни, не порядок уроков)",
    **{**_V3_BASE, "balanced_hard": ("1А", "1Б", "2А", "2Б", "3А", "4А", "4Б", "11А", "11Б"),
       "no_window_teachers": PROFILES["V8"].no_window_teachers},
    pins=PROFILES["V7"].pins, babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    change_weight=1000,
    description="Компромисс между V13 и V14: в 1–4 классах сохранён состав каждого дня по сетке завучей "
                "(какие предметы в какой день), но порядок уроков внутри дня подбирает алгоритм. "
                "Остальные правила как в V14; у всех 1–4 и 11-х классов дни равны по числу уроков.")
PROFILES["V16"] = Profile(
    "V16", "Версия 16 (итоговая)",
    **{**_V3_BASE,
       "window": 400, "window_low": 100, "window_low_teachers": tuple(sorted(COMBINED)),
       "teacher_day_cap": False, "teacher_spread": 300, "natural_not_adjacent": True, "natural_same_day": 300,
       "natural_exempt_classes": ("10А",), "teacher_cap_exempt": ("Шкиря Юрий Николаевич",),
       "sanpin": 400, "load_balance": 300,
       "start_hard_except": (),
       "balanced_hard": ("11А", "11Б"),
       "no_window_teachers": ("Пащенко Наталья Аркадьевна",)},
    pins=PROFILES["V7"].pins + primary_pins(), babich_windows_at=PROFILES["V7"].babich_windows_at,
    math_one_later_teachers=PROFILES["V7"].math_one_later_teachers,
    math_one_later_days=PROFILES["V7"].math_one_later_days,
    description="Итоговая версия. Основной упор — равномерность по дням и СанПиН; окна штатных учителей минимизируются, совместителям окна допускаются (низкий вес). Правки 21.09: Балташева — Пн и Ср 3–7; Байгазиева — Вт и "
                "Чт 4–7; Акауова во Вт только 1–4; 6В занимается казахским вместе с группой 6Б у Балгабаевой; "
                "5–6 классы — не больше 6 уроков, 11А — 1–7 уроки, все классы с 1-го урока; у штатных учителей разброс нагрузки между днями — не больше 2 уроков (штраф); физика, химия и биология у класса не стоят подряд; перекрёстные уроки "
                "информатики и английского в 6Б и 9Б — в один день. Расписание 1–4 классов закреплено по исправленной сетке завучей (21.09).")
BASE_OF = {"V7": "V4", "V8": "V7", "V9": "V8", "V10": "V8", "V13": "V12", "V14": "V12", "V15": "V12",
           "V16": "V12"}
NO_LAB_FOR = {"V9": {"Балташева Зару Такановна"}}
from dataclasses import replace  # noqa: E402

PROFILES["V19"] = replace(
    PROFILES["V16"], name="V19", title="Версия 19", babich_no_swap_classes=("10А",),  # 10А: Бабич без обмена с химией
    description=PROFILES["V16"].description.replace("Итоговая версия.", "Продолжение V18."))
BASE_OF["V19"] = BASE_OF["V16"]
PROFILES["V20"] = replace(PROFILES["V19"], name="V20", title="Версия 20", gym_hard_classes=("4Б",))
BASE_OF["V20"] = BASE_OF["V19"]
# V20: физкультура 10А в пятницу может сдвинуться (чтобы 4Б занимался в большом зале) —
# пятничные уроки 10А остаются в пятнице, порядок подбирается заново; уроки Бабича не двигаются.
FREE_10A_ORDER = {"V20": {FRI}, "V22": {FRI}}


def _big_classes():
    """Классы, которым по размеру положен большой спортзал (больше SMALL_GYM_MAX_KIDS учеников)."""
    from dataset import SMALL_GYM_MAX_KIDS, load
    return tuple(sorted(c["class_name"] for c in load("classes.json")["classes"]
                        if c["status"] == "active" and c["headcount"] > SMALL_GYM_MAX_KIDS))


# V22: физкультура у всех больших классов — строго в большом зале; чтобы развести 1Б и 2Б
# (в сетке завучей обе в Пн 4-м уроком), у них в понедельник свободен порядок уроков (состав дня тот же).
PROFILES["V22"] = replace(
    PROFILES["V20"], name="V22", title="Версия 22", gym_hard_classes=_big_classes(),
    pins=[{**p, "period": None} if p["class"] in ("1Б", "2Б") and p["day"] == 0 and "period" in p
          and p in primary_pins() else p for p in PROFILES["V20"].pins],
    description=PROFILES["V20"].description.replace("Продолжение V18.",
                                                    "Физкультура больших классов — только в большом зале."))
BASE_OF["V22"] = BASE_OF["V20"]
# V23: правила V22, английский 10А/9Б в окнах Бабича (каб.17) поощряется втрое сильнее.
PROFILES["V23"] = replace(PROFILES["V22"], name="V23", title="Версия 23",
                          babich_window_english_bonus=3 * PROFILES["V22"].babich_window_english_bonus)
BASE_OF["V23"] = BASE_OF["V22"]
FREE_10A_ORDER["V23"] = {FRI}
# V24: время как в V23, кабинеты переразложены — Алекпаровой не даётся каб.28 (НВП).
PROFILES["V24"] = replace(PROFILES["V23"], name="V24", title="Версия 24",
                          forbid_rooms={"Алекпарова Алия Жумабаевна": ["room_28"]})
BASE_OF["V24"] = BASE_OF["V23"]
FREE_10A_ORDER["V24"] = {FRI}
# V28 (правки 22.09): Дмитриев — нет уроков Пн 6–7, Вт 6, Чт 6–7, Пт 5–6 (в данных доступности);
# перекрёстные английский/информатика — подряд; 3-часовые английский, физкультура и история+право —
# по возможности Пн/Ср/Пт; история, всемирная история и основы права чередуются (не больше 1 в день);
# 3 разных языка в день — по возможности нет (все классы). У 10А свободен порядок уроков в Пн и Пт
# (в Пн у 10А стоял урок Дмитриева 7-м), уроки Бабича и четверг не двигаются.
# 22.09 (2): пик нагрузки 5–11 — вторник и четверг; физика/химия/биология подряд можно,
# но химия и биология — в разные дни (штраф); окна дешевле, СанПиН дороже.
PROFILES["V28"] = replace(PROFILES["V24"], name="V28", title="Версия 28", cross_adjacent=True,
                          mwf_three=400, lang_limit_all=400,
                          upper_curve=(8, 11, 9, 11, 7), natural_not_adjacent=False,
                          natural_same_day_subjects=("Химия", "Биология"),
                          window=100, window_low=25, sanpin=800,  # цель — СанПиН и удобство детей
                          room=0,  # урок в запасном/не своём кабинете — без штрафа
                          no_consecutive_days=("Физика",),  # физика не два дня подряд (кроме 10А)
                          sanpin_tol=3, sanpin_graded=True, cycle_same=100,
                          # началка — строго по сетке завучей (как в V16–V21), без перестановки Пн у 1Б/2Б;
                          # поэтому 1Б в Пн 4-м уроком в малом зале (в большом — 2Б), жёсткий зал для 1Б снят
                          pins=PROFILES["V20"].pins,
                          gym_hard_classes=tuple(c for c in PROFILES["V24"].gym_hard_classes if c != "1Б"),
                          description=PROFILES["V24"].description + " Правки 22.09: перекрёстные уроки английского "
                          "и информатики по группам идут подряд; 3-часовые английский, физкультура и история с "
                          "основами права — по возможности в Пн, Ср, Пт; история и основы права чередуются; "
                          "3 разных языка в день — по возможности нет.")
BASE_OF["V28"] = BASE_OF["V24"]
FREE_10A_ORDER["V28"] = {0, FRI}
# V29: разбор V28 — пятница у 5–11 перегружена, Вт/Чт недогружены: «Пн/Ср/Пт» перетягивало СанПиН.
# Правило «3-часовые на Пн/Ср/Пт» ослаблено (СанПиН важнее), музыка/ИЗО/труд первым уроком — штраф.
PROFILES["V29"] = replace(PROFILES["V28"], name="V29", title="Версия 29", mwf_three=100, light_first_points=4)
BASE_OF["V29"] = BASE_OF["V28"]
FREE_10A_ORDER["V29"] = {0, FRI}
# V30: V29 совпала с V28 — пятничный перекос структурный (зал, Сидоров Вт/Чт, Дмитриев). Музыка/ИЗО/труд
# 1-м уроком у 5–11 не ушли штрафом — теперь запрещены.
# 6Б/6В (ЛУО: короткие дни, много лёгких совместных уроков) запрет невыполним — для них штраф.
# V30: V29 + Балташева только в понедельник (1–7) — химия 8Ә и 11А сдвоенная в Пн.
# Минимум изменений: штраф за каждый урок, сдвинутый относительно V29.
PROFILES["V30"] = replace(PROFILES["V29"], name="V30", title="Версия 30", keep_weight=200)
BASE_OF["V30"] = BASE_OF["V29"]
FREE_10A_ORDER["V30"] = {0, FRI}
KEEP_FROM = {"V30": "V29"}
# V32 — тест: 10А не закреплён, кроме четверга Бабича (англ. Алии 3-м в каб.17, геометрия 4-м, алгебра 5-м).
# Окна Бабича с английским, запрет обменов в 10А и остальные правила — как в V30/V31.
_THU_KEEP = {"Иностранный язык", "Геометрия", "Алгебра и начала анализа"}
PROFILES["V32"] = replace(PROFILES["V30"], name="V32", title="Версия 32", keep_weight=0,
                          pins=[p for p in PROFILES["V30"].pins
                                if p["class"] != "10А" or (p["day"] == 3 and p["subject"] in _THU_KEEP)])
# V34 — тест: V32 + у 7А и 8Ә не больше 2 дней по 7 уроков (вынужденный минимум), считаем от V33.
PROFILES["V34"] = replace(PROFILES["V32"], name="V34", title="Версия 34", min_seven_days=("7А", "8Ә"))
PROFILES["V35"] = replace(PROFILES["V32"], name="V35", title="Версия 35", min_seven_days=("8Ә",))
KEEP_FROM_HINT = {"V34": "V33", "V35": "V33"}
# V42–V44 (25.09) — все правила V32/V33 и согласованные правки V34–V36, плюс:
#  · Мельников П.В. — 1–5 уроки (данные), ровно 3 рабочих дня по 3 урока; 2 окна подряд — большой штраф;
#  · Шкиря Ю.Н. — только Вт и Пт (данные);
#  · Красноперова О.В. (кл. руководитель 8Б) приходит к 1-му уроку: ожидание до первого урока — окно;
#    цель — 4–5 уроков в день и без 7-го урока (мягко); V42/V44 — 1-й урок жёстко, V43 — мягко;
#  · Досаева М.Х. — 2 окна подряд нельзя; у остальных 2 окна подряд — отдельный штраф;
#  · окна сверх 4 в неделю — прогрессивный штраф; день ради 1 урока и «размазанность» по неделе — штраф;
#  · Пащенко Н.А. — не больше 2 окон в неделю;
#  · ученица ЛУО 7А (Власова Анастасия) — не больше 1 окна в день и 3 в неделю, каждое окно — штраф;
#  · всемирная история — между двумя уроками истории Казахстана (правка V34); парные предметы
#    (каз. яз./лит., рус. яз./лит., алгебра/геометрия, история/право, биология/химия) чередуются по неделе — мягко;
#  · 10А Пн: история Казахстана 4-м, информатика 7-м (правка завуча в V33(1));
#  · большие классы — только большой зал; маленькие казахские классы — по возможности в большой;
#  · Бабич: уроки остаются в своих днях, окна на своих местах, четверг и английский 10А в каб.17 — как в V36;
#    V44 — в Пн/Пт можно окно под английский Алекпаровой (математика Бабича до 5-го урока);
#  · СанПиН (баллы с множителем 10А) — не хуже V36; каждый урок, сдвинутый относительно V36, — штраф;
#  · ровность нагрузки учителя по дням — дешевле, чем в V33 (СанПиН важнее).
KRASN, DOSAEVA, MELNIKOV, PASHCHENKO = ("Красноперова Ольга Викторовна", "Досаева Мадина Хайрулловна",
                                        "Мельников Павел Викторович", "Пащенко Наталья Аркадьевна")
SANPIN_POINTS_V36 = 1259  # баллы СанПиН V36 (8Ә пересчитан без запрещённой геометрии) — потолок
_V42 = dict(
    pins=PROFILES["V32"].pins + [
        {"class": "10А", "subject": "История Казахстана", "day": 0, "period": 4},
        {"class": "10А", "subject": "Информатика и искусственный интеллект", "day": 0, "period": 7}],
    no_window_teachers=(), window_caps={PASHCHENKO: 2},
    start_first_teachers=(KRASN,), start_first_hard=(KRASN,),
    teacher_day_band={KRASN: (4, 5)}, teacher_day_band_weight=60,
    teacher_late_periods={KRASN: (7,)}, teacher_late_weight=100,
    double_window=150, no_double_window_teachers=(DOSAEVA,),
    # Мельников: в 3-й рабочий день (кроме Вт/Чт) зал на 1–5 уроках занят началкой — 2 окна подряд там
    # неизбежны; поэтому не запрет, а большой штраф
    double_window_weights={MELNIKOV: 1500},
    window_excess=60, window_excess_over=4, single_lesson_day=100, teacher_extra_day=60,
    teacher_days_exact={MELNIKOV: (3, 3)},
    luo_student_window=300, luo_student_max_windows_day=1, luo_student_max_windows_week=3,
    gym_prefer_big=("1А", "2А", "4А", "5А", "6А", "8Ә", "11А"), gym_prefer_big_weight=40,
    teacher_spread=100,
    history_alternation=True,
    alternate_groups=(("Казахский язык", "Казахская литература"), ("Русский язык", "Русская литература"),
                      ("Алгебра", "Геометрия"), ("Алгебра и начала анализа", "Геометрия"),
                      ("История Казахстана", "Всемирная история", "Основы права"), ("Биология", "Химия")),
    alternate_weight=150,  # между двумя уроками одного предмета — урок парного (мягко)
    keep_weight=40, sanpin_cap=SANPIN_POINTS_V36,
    sanpin_cap_weight=2000)  # балл СанПиН сверх V36 — дороже любого окна (мягко: иначе солвер не стартует)
PROFILES["V42"] = replace(PROFILES["V32"], name="V42", title="Версия 42", **_V42,
                          description="V36 + Мельников 3 дня по 3 урока (1–5), Красноперова с 1-го урока (жёстко), "
                                      "без сдвоенных окон у Досаевой и Мельникова, ЛУО 7А ≤1 окна в день, "
                                      "СанПиН не хуже V36, минимум сдвигов относительно V36.")
PROFILES["V43"] = replace(PROFILES["V42"], name="V43", title="Версия 43", start_first_hard=(),
                          description=PROFILES["V42"].description.replace("(жёстко)", "(мягко)"))
PROFILES["V44"] = replace(PROFILES["V42"], name="V44", title="Версия 44",
                          math_one_later_days=(0, THU, FRI), babich_window_english_hard=True,
                          description=PROFILES["V42"].description + " Бабичу можно окно в Пн/Пт под английский Алии.")
# V45/V46: как V44/V42, но сдвиг урока относительно V36 дороже (≈ цена окна) — ближе к V36;
# учителя с нагрузкой до 12 ч — не больше ceil(часы/4) рабочих дней (каждый лишний день ≈ 3 окна)
PROFILES["V45"] = replace(PROFILES["V44"], name="V45", title="Версия 45", keep_weight=100, low_load_extra_day=300,
                          description=PROFILES["V44"].description + " Сдвиг урока ≈ окно.")
PROFILES["V46"] = replace(PROFILES["V42"], name="V46", title="Версия 46", keep_weight=100, low_load_extra_day=300,
                          description=PROFILES["V42"].description + " Сдвиг урока ≈ окно.")
# V47: правила V45, сдвиг урока втрое дороже — сколько улучшений остаётся при малом числе сдвигов
PROFILES["V47"] = replace(PROFILES["V45"], name="V47", title="Версия 47", keep_weight=300,
                          description=PROFILES["V45"].description + " Сдвиг урока втрое дороже.")
# V48/V49 — доработка V45 (сдвиг ≈ окно, правила V45 + малая нагрузка + чередование):
#  V48 — «глазами ребёнка»: штраф за 3 трудных урока подряд и трудный предмет на 6–7 уроке;
#  V49 — СанПиН ×1.5, окна сверх 4 дороже.
PROFILES["V48"] = replace(PROFILES["V45"], name="V48", title="Версия 48", heavy_triple=150, heavy_late=100,
                          description=PROFILES["V45"].description + " Не 3 трудных подряд, трудные не в конце дня.")
PROFILES["V49"] = replace(PROFILES["V45"], name="V49", title="Версия 49", sanpin=1200, window_excess=100,
                          description=PROFILES["V45"].description + " СанПиН ×1.5, окна сверх 4 дороже.")
# V50: правила V48 («глазами ребёнка»), сдвиг урока дорогой (как V47) — вариант «ближе к V36»
PROFILES["V50"] = replace(PROFILES["V48"], name="V50", title="Версия 50", keep_weight=300,
                          description=PROFILES["V48"].description + " Сдвиг урока втрое дороже.")
# V51: V50 (с ручными перестановками 26.09) + маленькие классы 5А+6А+8Ә и 11А — по возможности в большом зале
#       (вес ≈ 3 окна); минимум сдвигов считается от V50
PROFILES["V51"] = replace(PROFILES["V50"], name="V51", title="Версия 51", gym_prefer_big_weight=300,
                          description=PROFILES["V50"].description + " Маленькие классы — по возможности в большом зале.")
# V52 (эксперимент): 5А+6А+8Ә и 11А — в большом зале почти обязательно (штраф огромный) — цена в сдвигах/окнах
PROFILES["V52"] = replace(PROFILES["V51"], name="V52", title="Версия 52", gym_prefer_big_weight=5000,
                          gym_prefer_big=("5А", "6А", "8Ә", "11А"),
                          description=PROFILES["V50"].description + " 5А+6А+8Ә и 11А — в большом зале (почти жёстко).")
# V53: V50 + Анастасия (ЛУО 7А) приходит к 1-му уроку (жёстко, СанПиН: все дети вместе), уходит не позже 6-го
#       (6-й — штраф); минимум сдвигов от V50, окна вдвое дороже, обмены кабинетами с химией дороже (мягко)
PROFILES["V53"] = replace(PROFILES["V50"], name="V53", title="Версия 53",
                          luo_student_start_first=True, luo_student_last_max=6, luo_student_late={6: 300},
                          window=200, babich_chem_swap=300,
                          description=PROFILES["V50"].description + " Ученица ЛУО 7А — с 1-го урока, не позже 6-го.")
# V55: V53 + у Русиной Н.В. нет дня ради одного урока (жёстко ≥2 урока в рабочий день); минимум сдвигов от V53
PROFILES["V55"] = replace(PROFILES["V53"], name="V55", title="Версия 55",
                          teacher_min_per_day={"Русина Наталья Владимировна": 2},
                          description=PROFILES["V53"].description + " У Русиной нет дня ради одного урока.")
HINT_FROM = {"V48": "V45", "V49": "V45", "V50": "V47", "V51": "V50", "V52": "V50", "V55": "V53"}
for _n in ("V42", "V43", "V44", "V45", "V46", "V47", "V48", "V49", "V50"):
    KEEP_FROM[_n] = "V36"
KEEP_FROM["V51"] = "V50"
KEEP_FROM["V52"] = "V50"
KEEP_FROM["V53"] = "V50"
KEEP_FROM["V55"] = "V53"
# Бабич: из какой версии брать его сетку; в каких днях сетку (окна) не держать
BABICH_FROM = {"V42": ("V36", set()), "V43": ("V36", set()), "V44": ("V36", {0, FRI}),
               "V45": ("V36", {0, FRI}), "V46": ("V36", set()), "V47": ("V36", {0, FRI}),
               "V48": ("V36", {0, FRI}), "V49": ("V36", {0, FRI}),
               "V50": ("V36", {0, FRI}), "V51": ("V36", {0, FRI}), "V52": ("V36", {0, FRI}),
               "V53": ("V36", {0, FRI}), "V55": ("V36", {0, FRI})}
TWO_PHASE = {"V42", "V43", "V44", "V45", "V46", "V47"}  # сначала допустимое решение с минимумом сдвигов, потом оптимизация
TWO_PHASE.update({"V53", "V55"})
PHASE1_LIMIT = 300
LATEST_RULES = "V32"  # правила, по которым считаются следующие версии


def version_no(name: str) -> int:
    return int(name[1:]) if name[:1] == "V" and name[1:].isdigit() else -1


def ensure_profile(name: str):
    """V17, V18, … — очередные прогоны улучшения с правилами LATEST_RULES."""
    if name in PROFILES or version_no(name) <= version_no(LATEST_RULES):
        return
    from dataclasses import replace
    base = PROFILES[LATEST_RULES]
    PROFILES[name] = replace(base, name=name, title=f"Версия {version_no(name)}",
                             description=base.description.replace("Итоговая версия.",
                                                                  f"Улучшение предыдущей версии по правилам {LATEST_RULES}."))
    if LATEST_RULES in BASE_OF:
        BASE_OF[name] = BASE_OF[LATEST_RULES]
    if LATEST_RULES in FREE_10A_ORDER:
        FREE_10A_ORDER[name] = FREE_10A_ORDER[LATEST_RULES]


def saved_versions():
    return sorted((f.stem for f in OUT.glob("V*.json") if "." not in f.stem), key=version_no)


def best_hint(n_meetings=None):
    """Самое свежее решение с тем же составом уроков (иначе номера событий не совпадают)."""
    for f in sorted((f for f in OUT.glob("V*.json") if "." not in f.stem), key=lambda f: f.stat().st_mtime, reverse=True):
        res = json.loads(f.read_text(encoding="utf-8"))
        if n_meetings is None or len(res.get("slots", {})) == n_meetings:
            return res
    return None


def fixed_10a_from_v2(school):
    """10А как в V2, но в четверг география и основы права меняются местами (география — последней)."""
    v2 = json.loads((OUT / "V2.json").read_text(encoding="utf-8"))
    fixed = {mi: tuple(v2["slots"][str(mi)]) for mi, mt in enumerate(school.meetings) if "10А" in mt.classes}
    thu = 3
    geo = [mi for mi in fixed if fixed[mi][0] == thu and "География" in school.meetings[mi].class_subjects("10А")]
    law = [mi for mi in fixed if fixed[mi][0] == thu and "Основы права" in school.meetings[mi].class_subjects("10А")]
    if len(geo) == 1 and len(law) == 1 and fixed[geo[0]][1] < fixed[law[0]][1]:
        fixed[geo[0]], fixed[law[0]] = fixed[law[0]], fixed[geo[0]]
    return fixed


def base_slots_from_db(school, variant_id: str):
    """Слоты прежней версии из базы — по содержанию урока, а не по номеру.

    Состав уроков меняется (новые часы, новые класс-комплекты), поэтому номера событий
    между версиями не совпадают. Сопоставляем по (класс, предмет, учитель, подгруппа).
    """
    import os
    import sqlite3
    from collections import defaultdict

    from import_db import DB_PATH, SUBJECT_IDS, teacher_id
    # Раскладку сохраняем в файл: после нового импорта этой версии в базе может уже не быть.
    cache = OUT / f"db_{variant_id}.json"
    if cache.exists():
        rows = json.loads(cache.read_text(encoding="utf-8"))
    else:
        con = sqlite3.connect(os.environ.get("VECTOR_DB") or DB_PATH)
        rows = con.execute("SELECT class_id, subject_id, teacher_id, subgroup_label, day, period "
                           "FROM schedule_slots WHERE variant_id = ?", (variant_id,)).fetchall()
        con.close()
        if not rows:
            raise RuntimeError(f"в базе нет версии {variant_id} — нечего закреплять")
        cache.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    index = defaultdict(set)
    for cid, sid, tid, label, d, p in rows:
        index[(cid, sid, tid, label)].add((d, p))
    used = defaultdict(set)
    out = {}
    for mi, mt in enumerate(school.meetings):
        keys = [(c.lower(), SUBJECT_IDS[sj], teacher_id(sec.teacher), sub or "")
                for sec in mt.sections for c, sub, sj in sec.attendees]
        cand = set.intersection(*[index[k] for k in keys]) if all(k in index for k in keys) else set()
        cand -= set.union(*[used[k] for k in keys]) if keys else set()
        if cand:
            slot = sorted(cand)[0]
            out[mi] = slot
            for k in keys:
                used[k].add(slot)
    return out


def solve(names, limit=None):
    OUT.mkdir(parents=True, exist_ok=True)
    import dataset
    for name in names:
        dataset.NO_LAB_SEEKERS.clear()
        dataset.NO_LAB_SEEKERS.update(NO_LAB_FOR.get(name, set()))
        school = build()
        ensure_profile(name)
        prof = PROFILES[name]
        if name in ("V3", "V4"):
            prof.fixed_slots = fixed_10a_from_v2(school)
        if name == "V15":  # у началки закрепляем день, а не номер урока
            prof.pins = PROFILES["V7"].pins + [{**p, "period": None} for p in primary_pins()]
        base = None
        if name in BASE_OF:
            base = json.loads((OUT / f"{BASE_OF[name]}.json").read_text(encoding="utf-8"))
            prof.base_slots = {int(mi): tuple(dp) for mi, dp in base["slots"].items()}
            if len(base["slots"]) != len(school.meetings):  # состав уроков изменился
                prof.base_slots = base_slots_from_db(school, f"y2026_{BASE_OF[name].lower()}")
                base = None
            free_days = {"V7": {THU}, "V9": {TUE, FRI}}.get(name, set())
            free_day_order = FREE_10A_ORDER.get(name, set())
            prof.fixed_slots = {mi: dp for mi, dp in prof.base_slots.items()
                                if "10А" in school.meetings[mi].classes and dp[0] not in free_days
                                and (dp[0] not in free_day_order or BABICH in school.meetings[mi].teachers)}
            # в этих днях уроки 10А остаются в своём дне, но порядок внутри дня свободен
            prof.pins = list(prof.pins) + [
                {"class": "10А", "subject": sj, "day": dp[0], "period": None}
                for mi, dp in prof.base_slots.items()
                if "10А" in school.meetings[mi].classes and dp[0] in free_day_order
                and BABICH not in school.meetings[mi].teachers
                for sj in [school.meetings[mi].class_subjects("10А")]
                for sj in sj]
        if name in KEEP_FROM:
            prev = json.loads((OUT / f"{KEEP_FROM[name]}.json").read_text(encoding="utf-8"))
            prof.keep_slots = {int(mi): tuple(dp) for mi, dp in prev["slots"].items()}
        if name in BABICH_FROM:
            src_name, free_pattern = BABICH_FROM[name]
            src = json.loads((OUT / f"{src_name}.json").read_text(encoding="utf-8"))
            bab = {int(mi): tuple(dp) for mi, dp in src["slots"].items() if BABICH in school.meetings[int(mi)].teachers}
            # четверг Бабича и английский 10А в каб.17 — как есть
            prof.fixed_slots = {mi: dp for mi, dp in bab.items() if dp[0] == THU}
            prof.fixed_slots.update({
                int(mi): tuple(dp) for mi, dp in src["slots"].items()
                if "10А" in school.meetings[int(mi)].classes and any(
                    sec.teacher == ALEKPAROVA and src["rooms"].get(f"{mi}|{si}") == BABICH_ROOM
                    for si, sec in enumerate(school.meetings[int(mi)].sections))})
            # остальные дни: уроки в своём дне, окна (сетка занятости) на месте, порядок классов свободен
            prof.teacher_busy_fixed = {BABICH: {
                d: [int(any(dp == (d, p) for dp in bab.values())) for p in range(8)]
                for d in range(5) if d != THU and d not in free_pattern}}
            prof.pins = list(prof.pins) + [
                {"class": c, "subject": sj, "day": dp[0], "period": None}
                for mi, dp in bab.items() if dp[0] != THU
                for c in school.meetings[mi].classes for sj in school.meetings[mi].class_subjects(c)]
        if limit:
            prof.time_limit = limit
        hint = None
        own = OUT / f"{name}.json"
        prev_ver = OUT / f"V{version_no(name) - 1}.json"
        if own.exists():
            hint = json.loads(own.read_text(encoding="utf-8"))
        elif name in HINT_FROM:
            hint = json.loads((OUT / f"{HINT_FROM[name]}.json").read_text(encoding="utf-8"))
        elif name in KEEP_FROM:
            hint = json.loads((OUT / f"{KEEP_FROM[name]}.json").read_text(encoding="utf-8"))
        elif name in KEEP_FROM_HINT:
            hint = json.loads((OUT / f"{KEEP_FROM_HINT[name]}.json").read_text(encoding="utf-8"))
        elif version_no(name) > version_no(LATEST_RULES) and prev_ver.exists():
            hint = json.loads(prev_ver.read_text(encoding="utf-8"))  # продолжаем с прошлой версии
        elif base:
            strict = OUT / "old" / f"{name}_strict_hint.json"
            hint = json.loads(strict.read_text(encoding="utf-8")) if strict.exists() else base
        else:
            hint = best_hint(len(school.meetings))
        if name in TWO_PHASE and not own.exists():
            # этап 1: любое допустимое расписание с минимумом сдвигов (без потолка СанПиН)
            from dataclasses import replace as _replace
            p1 = Built(school, _replace(prof, sanpin_cap=None, time_limit=PHASE1_LIMIT)).build()
            p1.terms = {"moved_vs_prev": [(1, 1 - p1.x[(mi, d, p)] if (mi, d, p) in p1.x else 1)
                                          for mi, (d, p) in p1.p.keep_slots.items()]}
            print(f"[{name}] этап 1: допустимое решение, до {PHASE1_LIMIT} с …", flush=True)
            r1 = p1.solve(hint=hint, log_path=str(OUT / f"{name}.phase1.log"))
            print(f"[{name}] этап 1: {r1['status']}, сдвигов {r1.get('objective')}", flush=True)
            if "slots" not in r1:
                continue
            (OUT / f"{name}.phase1.json").write_text(json.dumps(r1, ensure_ascii=False), encoding="utf-8")
            hint = r1
        b = Built(school, prof).build()
        print(f"[{name}] {prof.title}: решаю до {prof.time_limit} с …", flush=True)
        partial = OUT / f"{name}.partial.json"
        stop = OUT / f"{name}.stop"
        stop.unlink(missing_ok=True)

        def snapshot(r, partial=partial, name=name):
            partial.write_text(json.dumps(r, ensure_ascii=False), encoding="utf-8")
            print(f"[{name}] промежуточное решение: штраф {r['objective']} ({r['wall_sec']:.0f} с)", flush=True)
        res = b.solve(hint=hint, log_path=str(OUT / f"{name}.log"), on_solution=snapshot, stop_file=str(stop))
        stop.unlink(missing_ok=True)
        print(f"[{name}] {res['status']} за {res.get('wall_sec')} с, штраф {res.get('objective')}", flush=True)
        if "slots" not in res:
            continue
        start_hard = {c for c in school.classes
                      if (prof.primary_start_hard and int(c[:-1]) <= 4)
                      or (prof.start_hard_except is not None and c not in prof.start_hard_except)}
        errs = verify(school, res, res["relaxed_daily"], no_window_teachers=prof.no_window_teachers,
                      start_hard_classes=start_hard, balanced_hard=prof.balanced_hard, pins=prof.pins,
                      babich_windows_at=prof.babich_windows_at,
                      alia_all_in_babich_windows=prof.alia_all_in_babich_windows,
                      math_one_later_teachers=prof.math_one_later_teachers,
                      math_one_later_days=prof.math_one_later_days,
                      teacher_day_cap=prof.teacher_day_cap, low_teachers=prof.window_low_teachers,
                      natural_not_adjacent=prof.natural_not_adjacent,
                      cap_exempt=prof.teacher_cap_exempt, natural_exempt=prof.natural_exempt_classes,
                      babich_no_swap_classes=prof.babich_no_swap_classes)
        res["hard_violations"] = errs
        res["metrics"] = metrics(school, res)
        res["profile"] = {k: v for k, v in prof.__dict__.items() if k != "extra"}
        prev = json.loads(own.read_text(encoding="utf-8")) if own.exists() else None
        # Сравнивать штрафы можно только при одинаковых правилах: при смене профиля старое решение
        # может казаться лучше просто потому, что считалось по более мягким условиям.
        if prev and prev.get("profile") != res["profile"]:
            prev = None
        if prev and prev.get("objective", 1e18) <= res["objective"] and not prev.get("hard_violations"):
            print(f"[{name}] прежний результат лучше ({prev['objective']}) — оставляю его")
            continue
        own.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
        print(f"[{name}] нарушений жёстких правил: {len(errs)}; окон у учителей: "
              f"{res['metrics']['teacher_windows_total']}", flush=True)


def report_lines(school, res):
    m = res["metrics"]
    prof = res["profile"]
    L = [("Вариант", ""), ("Название", f"{prof['name']} — {prof['title']}"), ("Настройки", prof["description"]),
         ("Статус солвера", f"{res['status']}, {res['wall_sec']} с; итоговый штраф {res['objective']}"),
         ("Жёсткие правила", "нарушений нет" if not res["hard_violations"] else "\n".join(res["hard_violations"])),
         ("Штрафы по компонентам", ""),
         ]
    names = {"window": "Окна учителей", "sanpin": "СанПиН (кривая Пн7/Вт11/Ср11/Чт9/Пт7 + позиция трудных)",
             "room": "Перемещения/свапы кабинетов", "alternation": "Чередование связанных предметов",
             "load_balance": "Равномерность нагрузки класса", "late_start": "Класс начинает не с 1-го урока",
             "eighth_lesson": "8-й урок", "sixth_primary": "6-й урок в 3А/4Б", "primary_home_room":
                 "Начальные классы не в своём кабинете", "babich_window_english":
                 "Окно Бабича не занято английским Алекпаровой (9Б/10А, каб.17)",
             "babich_extra_window": "Лишние окна Бабича (>1 в день)",
             "babich_late": f"Бабич позже {prof.get('babich_finish_lesson', 5)}-го урока",
             "babich_window_english_bonus": "Окна Бабича с английским Алекпаровой в каб.17 (бонус)",
             "seeker_room": "Совместители не в профильном кабинете",
             "gym": "Физкультура не в своём зале (большой / малый)",
             "primary_languages": "1–4 классы: 3 разных языка в один день",
             "moved_vs_base": "Уроков сдвинуто относительно базовой версии",
             "teacher_spread": "Неравномерность нагрузки учителей по дням (сверх 2 уроков)",
             "natural_same_day": "Два естественных предмета у класса в один день",
             "babich_chem_swap": "Свап с химией (не на геометрии Вт/Чт)", "babich_chem_swap_geo":
                 "Свап с химией на геометрии Вт/Чт"}
    for k, v in res["breakdown"].items():
        if HIDE_PERSONAL and k.startswith("babich"):
            continue
        L.append((names.get(k, k), f"{v['units']} (штраф {v['cost']})"))
    L += [("Показатели", ""), ("Окон у учителей всего", str(m["teacher_windows_total"])),
          ("Окна по учителям", ", ".join(f"{k.split()[0]}: {v}" for k, v in m["teacher_windows"].items() if v)),
          ("Классы начинают не с 1-го урока", f"{m['late_starts']} случаев"),
          ("8-й урок", f"{m['eighth_lessons']} случаев"),
          ("Уроков по дням (Пн–Пт)", "\n".join(f"{c}: {' / '.join(map(str, v))}" for c, v in m["class_day_counts"].items())),
          ("1–4 классы: дни с 3 языками", ", ".join(m.get("primary_three_languages", [])) or "нет"),
          ("Допущения и особенности данных", ""),
          ("Ослабленные правила", "\n".join(res["relaxed_daily"]) or "нет"),
          ("3А и 4Б", "26 и 27 ч в неделю не помещаются в лимит «5 уроков × 5 дней» — разрешён 6-й урок (со штрафом)."),
          ("10А", "Граница — 7-й урок (щадящий режим)."),
          ("ДО / ЛУО", "В расписании только Тургумбаева Айсана (8Б ДО, фиксированные 2–3 уроки). Остальные ДО, ООП/ЗПР — "
                      "не включены. 6В (ЛУО) — не позже 6-го урока. Власова (ЛУО) ходит на уроки 7А."),
          ("Не включено", "Факультативы/вариатив: инд.-групповые занятия, «Свой предмет», Личная безопасность, "
                          "Основы Конституции, Закон и Порядок."),
          ("Правила кабинетов", "Учителя с кабинетом ведут у себя; без кабинета — в свободном. Химия — каб.17 "
                                "Красноперовой (Бабич тогда в каб.19; других причин выселять Бабича нет). "
                                "Совместители Балташева (химия) и Аятова (физика) — профильный кабинет, если свободен, "
                                "иначе любой свободный; их 2 урока в день у класса стоят подряд. Физкультура — "
                                "спортзал/малый зал, информатика — каб.26, труды — мастерские 29/39, НВП — каб.28.")]
    return L


def export_all(names=()):
    """Выгрузка в Excel. Без аргументов — все версии; старые версии, посчитанные до изменения
    состава уроков, пропускаются: их номера событий уже не совпадают с текущими данными."""
    XLSX_DIR.mkdir(parents=True, exist_ok=True)
    school = build()
    from export_xlsx import export
    files = []
    chosen = [OUT / f"{n}.json" for n in names] if names else sorted(f for f in OUT.glob("V*.json") if "." not in f.stem)
    for f in chosen:
        res = json.loads(f.read_text(encoding="utf-8"))
        if len(res["slots"]) != len(school.meetings):
            print(f"пропускаю {f.stem}: посчитан на другом составе уроков")
            continue
        prof = res["profile"]
        title = f"Расписание 2026–2027 · Вариант {prof['name'][1:]} — {prof['title']}"
        path = XLSX_DIR / f"Расписание_{prof['name']}_{prof['title'].split(' (')[0].replace(' ', '_')}.xlsx"
        export(school, res, path, title, report_lines(school, res))
        files.append(path)
        print("записан", path)
    return files


def import_all_to_db(active="V1"):
    ensure_profile(active)
    from import_db import import_all
    school = build()
    variants = []
    sections = {f"{mi}|{si}" for mi, mt in enumerate(school.meetings) for si in range(len(mt.sections))}
    for f in sorted(f for f in OUT.glob("V*.json") if "." not in f.stem):
        res = json.loads(f.read_text(encoding="utf-8"))
        prof = res["profile"]
        if set(res["rooms"]) != sections:  # посчитан на прежних данных — с текущей нагрузкой не сходится
            print(f"[{f.stem}] пропущен: посчитан на прежних данных")
            continue
        variants.append({"id": f"y2026_{prof['name'].lower()}", "name": f"2026–2027 · {prof['name']} — {prof['title']}",
                         "number": len(variants) + 1, "active": prof["name"] == active, "res": res})
    w = PROFILES.get(active) or Profile(**{k: v for k, v in json.loads(
        (OUT / f"{active}.json").read_text(encoding="utf-8"))["profile"].items()})
    info = import_all(school, variants, {"window": w.window, "room": w.room, "sanpin": w.sanpin,
                                         "alternation": w.alternation, "load_balance": w.load_balance})
    print(json.dumps(info, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1]
    if cmd == "solve":
        args = sys.argv[2:]
        limit = None
        if args and args[0].isdigit():
            limit = int(args[0])
            args = args[1:]
        solve(args, limit)
    elif cmd == "improve":  # новый большой прогон → следующая версия (V17, V18, …)
        last = max(saved_versions(), key=version_no)
        name = f"V{version_no(last) + 1}"
        print(f"продолжаю {last} → {name}")
        solve([name], int(sys.argv[2]) if len(sys.argv) > 2 else None)
    elif cmd == "stop":  # досрочно завершить идущий расчёт: лучшее решение проверится и сохранится
        for n in sys.argv[2:]:
            (OUT / f"{n}.stop").touch()
            print(f"[{n}] отправлен сигнал остановки")
    elif cmd == "export":
        export_all(sys.argv[2:])
    elif cmd == "import":
        import_all_to_db(*(sys.argv[2:3]))

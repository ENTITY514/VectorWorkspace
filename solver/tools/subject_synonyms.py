"""
Словарь синонимов предметов (kz/ru → нормализованный id).
Ключ — нормализованная нижняя строка без точек/запятых, значение — (id, display_name, sanitary_weight, required_room_type)
"""
# sanitary_weight по СанПиН (1..10), required_room_type если специализированный
SUBJECT_SYNONYMS = {
    # букварь / обучение грамоте
    "алиппе": ("bukvar", "Букварь", 8, None),
    "алиппе ана тили": ("bukvar", "Букварь", 8, None),
    "букварь": ("bukvar", "Букварь", 8, None),
    "букварь обучение гр": ("bukvar", "Букварь", 8, None),
    "обучение грамоте": ("bukvar", "Букварь", 8, None),
    "ана тили": ("kazakh_language", "Казахский язык", 7, None),
    "казахский язык": ("kazakh_language", "Казахский язык", 7, None),
    "асаева": ("kazakh_language", "Казахский язык", 7, None),  # fallback
    # математика
    "математика": ("math", "Математика", 9, None),
    # музыка
    "музыка": ("music", "Музыка", 3, None),
    # естествознание / жаратылыстану / дуниетану
    "естествознание": ("estestvoznanie", "Естествознание", 7, None),
    "жаратылыстану": ("estestvoznanie", "Естествознание", 7, None),
    "дуниетану": ("dunietanu", "Дүниетану", 6, None),
    # физкультура
    "физкультура": ("pe", "Физкультура", 2, "Gym"),
    "дене шыныктыру": ("pe", "Физкультура", 2, "Gym"),
    "дене": ("pe", "Физкультура", 2, "Gym"),
    # ИЗО
    "изо": ("izo", "ИЗО", 3, None),
    "бейнелеу": ("izo", "ИЗО", 3, None),
    "бейнелеу онерi": ("izo", "ИЗО", 3, None),
    # труд / еңбек
    "труд": ("trud", "Труд", 4, "Workshop"),
    "труд об": ("trud", "Труд", 4, "Workshop"),
    "еңбекке баулу": ("trud", "Труд", 4, "Workshop"),
    # русский язык / литература
    "русский язык": ("russian", "Русский язык", 7, None),
    "литература": ("literature", "Литература", 6, None),
    "чтение": ("literature", "Литература", 6, None),
    # английский
    "английский язык": ("english", "Английский язык", 6, "LanguageLab"),
    "английский": ("english", "Английский язык", 6, "LanguageLab"),
    # казахская литература
    "казахская литература": ("kazakh_literature", "Казахская литература", 6, None),
    # история
    "история": ("history", "История", 6, None),
    "история казахстана": ("history_kz", "История Казахстана", 6, None),
    # география
    "география": ("geography", "География", 6, None),
    # биология
    "биология": ("biology", "Биология", 7, "BiologyLab"),
    # химия
    "химия": ("chemistry", "Химия", 9, "ChemistryLab"),
    # физика
    "физика": ("physics", "Физика", 9, "PhysicsLab"),
    # информатика
    "информатика": ("informatics", "Информатика", 7, "Informatics"),
    # технология
    "технология": ("technology", "Технология", 4, "Workshop"),
    # самопознание
    "самопознание": ("samopoznanie", "Самопознание", 3, None),
    # естествознание уже
    "познание мира": ("poznanie", "Познание мира", 6, None),
    # алгебра / геометрия
    "алгебра": ("algebra", "Алгебра", 9, None),
    "геометрия": ("geometry", "Геометрия", 9, None),
    # черчение
    "черчение": ("drawing", "Черчение", 4, None),
}

# обратная карта для нормализации
def normalize_subject(raw: str):
    import re
    s = raw.strip().lower()
    s = s.replace(".", "").replace(",", "").strip()
    # убрать лишние слова "обучение гр" уже в ключе
    # попытка точного совпадения
    if s in SUBJECT_SYNONYMS:
        return SUBJECT_SYNONYMS[s]
    # подстрока
    for key, val in SUBJECT_SYNONYMS.items():
        if key in s or s in key:
            return val
    # fallback: создать id из raw
    slug = re.sub(r'[^a-zа-я0-9]+', '_', s)[:20].strip('_')
    if not slug:
        slug = "unknown"
    # эвристика веса по длине / сложности
    weight = 5
    if "математ" in s or "алгебра" in s or "геометрия" in s or "физика" in s or "химия" in s:
        weight = 9
    elif "язык" in s:
        weight = 7
    return (slug, raw.strip().title()[:30], weight, None)

"""
Инференс RoomType из строки кабинета.
"""
def infer_room_type(raw: str):
    s = raw.strip().lower()
    if not s:
        return "General"
    if "спорт" in s or "зал" in s and "спортив" in s:
        return "Gym"
    if "хими" in s:
        return "ChemistryLab"
    if "физика" in s and "кабинет" in s:
        return "PhysicsLab"
    if "биолог" in s:
        return "BiologyLab"
    if "информатик" in s or "компьютер" in s:
        return "Informatics"
    if "язык" in s or "линг" in s:
        return "LanguageLab"
    if "мастерск" in s or "технолог" in s or "труд" in s:
        return "Workshop"
    return "General"

def room_capacity_for_type(room_type: str) -> int:
    if room_type == "Gym":
        return 40
    if room_type in ("ChemistryLab", "PhysicsLab", "BiologyLab", "Informatics"):
        return 25
    return 30

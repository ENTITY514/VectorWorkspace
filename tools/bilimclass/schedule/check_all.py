"""Свежая проверка verify() для всех вариантов + что сохранено в файле."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.append(str(Path(__file__).resolve().parent))

from dataset import build  # noqa: E402
from verify import verify  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "bilimclass" / "output"

school = build()
for name in ["V34", "V35", "V36", "V40", "V41"]:
    path = OUT / f"{name}.json"
    if not path.exists():
        print(name, "— файла нет")
        continue
    res = json.load(open(path, encoding="utf-8"))
    prof = res.get("profile", {})
    start_hard = {c for c in school.classes
                  if (prof.get("primary_start_hard") and int(c[:-1]) <= 4)
                  or (prof.get("start_hard_except") is not None
                      and c not in prof.get("start_hard_except"))}
    errs = verify(school, res, res.get("relaxed_daily") or [],
                  no_window_teachers=tuple(prof.get("no_window_teachers", ())),
                  start_hard_classes=start_hard,
                  balanced_hard=tuple(prof.get("balanced_hard", ())),
                  pins=tuple(prof.get("pins", ())),
                  babich_windows_at=tuple(map(tuple, prof.get("babich_windows_at", ())))
                  if prof.get("babich_windows_at") else (),
                  alia_all_in_babich_windows=prof.get("alia_all_in_babich_windows", False),
                  math_one_later_teachers=tuple(prof.get("math_one_later_teachers", ())),
                  math_one_later_days=prof.get("math_one_later_days"),
                  teacher_day_cap=prof.get("teacher_day_cap", False),
                  low_teachers=tuple(prof.get("window_low_teachers", ())),
                  natural_not_adjacent=prof.get("natural_not_adjacent", False),
                  cap_exempt=tuple(prof.get("teacher_cap_exempt", ())),
                  natural_exempt=tuple(prof.get("natural_exempt_classes", ())),
                  babich_no_swap_classes=tuple(prof.get("babich_no_swap_classes", ())))
    stored = res.get("hard_violations")
    stored_txt = "<нет ключа>" if stored is None else str(len(stored))
    print(f"{name}: свежий verify -> {len(errs)}; сохранено в файле -> {stored_txt}")
    for e in errs:
        print("     ", e)

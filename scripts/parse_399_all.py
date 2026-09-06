#!/usr/bin/env python3
"""Parse all TUP appendices from 399 order DOCX (2026-2027 edition)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx.table import Table
from docx.text.paragraph import Paragraph

from parse_399_math_tup import (
    GRADE_MARK_RE,
    cell_text,
    extract_goal,
    extract_hours,
    extract_legal,
    extract_tasks,
    iter_blocks,
    parse_dsp_row,
    parse_objectives_from_tables,
    ptext,
    split_documents,
    table_matrix,
)

ROOT = Path(r"E:\Projects\VectorWorkspace")
OUT = ROOT / "scripts" / "_399_extract"
MAT = ROOT / "Materials" / "399 приказ 2026-2027"

def discover_files() -> list[tuple[Path, str]]:
    if not MAT.exists():
        return []
    out: list[tuple[Path, str]] = []
    for f in sorted(MAT.iterdir(), key=lambda p: p.name.lower()):
        if f.suffix.lower() != ".docx":
            continue
        if f.name.startswith("~$") or f.name.startswith(".~"):
            continue
        n = f.name.lower()
        if "имп" in n:
            continue
        # «приказ» содержит «каз» — смотрим хвост имени после этого слова
        tail = n.replace("приказ", "")
        lang = "KZ" if ("каз" in tail or "қаз" in tail) else "RU"
        out.append((f, lang))
    return out

SUBJECT_SLUG = {
    "әліппе": "alphabet",
    "букварь": "bukvar",
    "обучение грамоте": "gramota",
    "елипбә": "elipbe",
    "алифбе": "alifbe",
    "алифбо": "alifbo",
    "ана тілі": "ana_tili",
    "математика": "mathematics",
    "цифровая грамотность": "digital_literacy",
    "цифрлық сауаттылық": "digital_literacy",
    "естествознание": "natural_science",
    "жаратылыстану": "natural_science",
    "познание мира": "world_knowledge",
    "дүниетану": "world_knowledge",
    "изобразительное искусство": "visual_art",
    "бейнелеу өнері": "visual_art",
    "трудовое обучение": "labor_training",
    "еңбекке баулу": "labor_training",
    "художественный труд": "art_work",
    "көркем еңбек": "art_work",
    "музыка": "music",
    "физическая культура": "physical_education",
    "дене шынықтыру": "physical_education",
    "литературное чтение": "literary_reading",
    "әдебиеттік оқу": "literary_reading",
    "казахский язык": "kazakh_language",
    "қазақ тілі": "kazakh_tili",
    "казақ тілі": "kazakh_tili",
    "русский язык": "russian_language",
    "орыс тілі": "russian_language",
    "уйгурский язык": "uigur_language",
    "ұйғыр тілі": "uigur_language",
    "узбекский язык": "uzbek_language",
    "өзбек тілі": "uzbek_language",
    "таджикский язык": "tadzhik_language",
    "тәжік тілі": "tadzhik_language",
    "английский язык": "english",
    "ағылшын тілі": "english",
    "немецкий язык": "german",
    "неміс тілі": "german",
    "французский язык": "french",
    "француз тілі": "french",
    "казахская литература": "kazakh_literature",
    "қазақ әдебиеті": "kazakh_adebieti",
    "русская литература": "russian_literature",
    "орыс әдебиеті": "russian_literature",
    "уйгурская литература": "uigur_literature",
    "ұйғыр әдебиеті": "uigur_literature",
    "узбекская литература": "uzbek_literature",
    "өзбек әдебиеті": "uzbek_literature",
    "таджикская литература": "tadzhik_literature",
    "тәжік әдебиеті": "tadzhik_literature",
    "казахский язык и литература": "kazakh_language_literature",
    "қазақ тілі және әдебиеті": "kazakh_language_literature",
    "қазақ тілі мен әдебиеті": "kazakh_language_literature",
    "русский язык и литература": "russian_language_literature",
    "орыс тілі және әдебиеті": "russian_language_literature",
    "орыс тілі мен әдебиеті": "russian_language_literature",
    "алгебра": "algebra",
    "геометрия": "geometry",
    "алгебра и начала анализа": "algebra_analysis",
    "алгебра және анализ бастамалары": "algebra_analysis",
    "физика": "physics",
    "химия": "chemistry",
    "биология": "biology",
    "информатика": "informatics",
    "информатика и искусственный интеллект": "informatics",
    "информатика және жасанды интеллект": "informatics",
    "география": "geography",
    "история казахстана": "kazakhstan_history",
    "қазақстан тарихы": "kazakhstan_history",
    "всемирная история": "world_history",
    "дүниежүзі тарихы": "world_history",
    "основы права": "law_fundamentals",
    "құқық негіздері": "law_fundamentals",
    "абайтану": "abaitanu",
    "краеведение": "regional_studies",
    "өлкетану": "regional_studies",
    "графика и проектирование": "graphics_design",
    "графика және жобалау": "graphics_design",
    "начальная военная и технологическая подготовка": "military_training",
    "алғашқы әскери және технологиялық дайындық": "military_training",
    "бастапқы әскери даярлық": "military_training",
    "бастапқы әскери және технологиялық дайындық": "military_training",
    "основы предпринимательства и бизнеса": "entrepreneurship",
    "кәсіпкерлік және бизнес негіздері": "entrepreneurship",
    "глобальные компетенции": "global_competencies",
    "жаһандық құзыреттер": "global_competencies",
    "жаһандық құзыреттілік": "global_competencies",
    "светскость и основы религиоведения": "secularism_religiology",
    "зайырлылық және дінтану негіздері": "secularism_religiology",
    "алаштану": "alashtanu",
    "иностранный язык (второй). английский язык": "second_language_english",
    "шет тілі (екінші). ағылшын тілі": "second_language_english",
    "иностранный язык (второй). немецкий язык": "second_language_german",
    "шет тілі (екінші). неміс тілі": "second_language_german",
    "иностранный язык (второй). французский язык": "second_language_french",
    "шет тілі (екінші). француз тілі": "second_language_french",
    "история становления межэтнических отношений": "interethnic_relations",
    "этносаралық қатынастардың қалыптасу тарихы": "interethnic_relations",
}

KK_SUBJECTS = {
    "ana_tili",
    "kazakh_tili",
    "kazakh_language",
    "kazakh_adebieti",
    "kazakh_literature",
    "kazakh_language_literature",
    "abaitanu",
}

TITLE_RE = re.compile(
    r"Типовая учебная программа по (?:учебному )?предмету\s+[«\"“](.+?)[»\"”]",
    re.I,
)
TITLE_KZ_RE = re.compile(
    r"[«\"“]([^»\"”]{3,80})[»\"”]\s+(?:оқу\s+пәні|пәні)",
    re.I,
)
GRADES_RE = re.compile(r"для\s+(\d{1,2})\s*[–\-]\s*(\d{1,2})")
GRADE_SINGLE_RE = re.compile(r"для\s+(\d{1,2})\s+класса", re.I)
GRADES_KZ_RE = re.compile(r"(\d{1,2})\s*[–\-]\s*(\d{1,2})(?:\s*\(\d+\))?\s*-?\s*сынып")
GRADE_SINGLE_KZ_RE = re.compile(r"(\d{1,2})\s*-сыныб", re.I)
HOURS_KZ_RE = re.compile(
    r"(\d{1,2})\s*-?\s*сынып(?:та)?\s*[–—-]?\s*аптасына\s+(\d+(?:[.,]\d+)?)\s+сағат[,\s]+оқу\s+жылында\s*[–—-]?\s*(\d+)\s+сағат",
    re.I,
)


def detect_title(texts: list[str]) -> str:
    candidates = []
    for i, t in enumerate(texts[:25]):
        low = t.lower()
        if "типовая учебная программа" in low or "үлгілік оқу бағдарламасы" in low:
            parts = [t]
            for nxt in texts[i + 1 : i + 3]:
                nlow = nxt.lower()
                if nlow.startswith("для ") or nlow.startswith("уровн") or "бағытындағы" in nlow:
                    parts.append(nxt)
                else:
                    break
            candidates.append(" ".join(parts))
    if candidates:
        def score(t: str) -> float:
            low = t.lower()
            s = 0.0
            if "«" in t or '"' in t or "“" in t:
                s += 10
            if "жаратылыстану-математикалық" in low or "естественно-математического" in low:
                s += 6
            if "қоғамдық-гуманитарлық" in low or "общественно-гуманитарного" in low:
                s += 6
            if "сынып" in low or "класс" in low:
                s += 3
            return s + min(len(t), 240) / 240
        return max(candidates, key=score)
    return texts[3] if len(texts) > 3 else (texts[0] if texts else "")


def extract_subject_name(title: str) -> str:
    m = TITLE_RE.search(title)
    if m:
        return m.group(1).strip()
    m = TITLE_KZ_RE.search(title)
    if m:
        return m.group(1).strip()
    for q in re.findall(r"[«\"“]([^»\"”]{2,80})[»\"”]", title):
        if q.lower() not in {"абай мектептерінің"}:
            return q.strip()
    return ""


def resolve_slug(name: str) -> str | None:
    key = re.sub(r"\s+", " ", name).strip().lower()
    if not key:
        return None
    if key in SUBJECT_SLUG:
        return SUBJECT_SLUG[key]
    best = None
    best_len = 0
    for k, slug in SUBJECT_SLUG.items():
        if k in key or key in k:
            if len(k) > best_len:
                best = slug
                best_len = len(k)
    return best


def extract_grades(title: str) -> str:
    m = GRADES_RE.search(title)
    if m:
        return f"{int(m.group(1))}-{int(m.group(2))}"
    m = GRADE_SINGLE_RE.search(title)
    if m:
        g = int(m.group(1))
        return f"{g}-{g}"
    m = GRADES_KZ_RE.search(title)
    if m:
        return f"{int(m.group(1))}-{int(m.group(2))}"
    m = GRADE_SINGLE_KZ_RE.search(title)
    if m:
        g = int(m.group(1))
        return f"{g}-{g}"
    return ""


def extract_direction(title: str) -> str:
    t = title.lower()
    if "естественно-математического" in t or "жаратылыстану-математикалық" in t:
        return "emn"
    if "общественно-гуманитарного" in t or "қоғамдық-гуманитарлық" in t:
        return "ogn"
    return "common"


def subject_language(subject_id: str, file_lang: str) -> str:
    if file_lang == "KZ":
        return "KZ"
    return "KK" if subject_id in KK_SUBJECTS else "RU"


def extract_hours_any(texts: list[str]) -> list[dict]:
    hours = extract_hours(texts)
    if hours:
        return hours
    joined = " ".join(texts)
    seen = set()
    out = []
    for m in HOURS_KZ_RE.finditer(joined):
        grade = int(m.group(1))
        if grade in seen:
            continue
        seen.add(grade)
        out.append(
            {
                "grade": grade,
                "hours_per_week": float(m.group(2).replace(",", ".")),
                "hours_per_year": int(m.group(3)),
            }
        )
    return out


def parse_chunk(num: int, blocks: list, file_lang: str) -> dict | None:
    texts: list[str] = []
    for b in blocks:
        if isinstance(b, Paragraph):
            t = ptext(b).strip()
            if t:
                texts.append(t)
    title = detect_title(texts)
    head = " ".join(texts[:20])
    name = extract_subject_name(title) or extract_subject_name(head)
    slug = resolve_slug(name)
    if not slug:
        return {
            "skip": True,
            "appendix_number": num,
            "title": title,
            "subject_name": name,
            "reason": f"unknown subject: {name!r}",
        }
    grades = extract_grades(title) or extract_grades(head)
    if not grades:
        return {
            "skip": True,
            "appendix_number": num,
            "title": title,
            "subject_name": name,
            "reason": "no grades",
        }

    p2_tables: list[list[list[str]]] = []
    zone = "p1"
    default_grade = int(grades.split("-")[0])
    dsp_state = {"grade": default_grade, "quarter": 1, "section": ""}
    quarters: dict[tuple[int, int], dict] = {}
    in_main_p3 = False
    table_count = 0

    for b in blocks:
        if isinstance(b, Paragraph):
            t = ptext(b).strip()
            if not t:
                continue
            low = t.lower()
            if ("параграф 2" in low or "2-параграф" in low) and ("систем" in low or "мақсат" in low):
                zone = "p2"
                in_main_p3 = False
            elif ("параграф 3" in low or "3-параграф" in low) and (
                "долгосроч" in low or "мерзімді" in low or "жоспар" in low
            ):
                if zone == "g3":
                    in_main_p3 = False
                    zone = "g3"
                else:
                    zone = "p3"
                    in_main_p3 = True
                    dsp_state = {"grade": default_grade, "quarter": 1, "section": ""}
            elif low.startswith("глава 3") or low.startswith("3-тарау"):
                zone = "g3"
                in_main_p3 = False
            if in_main_p3:
                gm = GRADE_MARK_RE.search(t)
                if gm and len(t) < 50:
                    dsp_state["grade"] = int(gm.group(1))
                    dsp_state["quarter"] = 1
                    dsp_state["section"] = ""
                else:
                    km = re.search(r"(\d{1,2})\s*-?\s*сынып", t, re.I)
                    if km and len(t) < 50:
                        dsp_state["grade"] = int(km.group(1))
                        dsp_state["quarter"] = 1
                        dsp_state["section"] = ""
        else:
            table_count += 1
            if zone == "p2":
                p2_tables.append(table_matrix(b))
            elif in_main_p3:
                matrix = table_matrix(b)
                head = matrix[0][0].lower() if matrix and matrix[0] else ""
                if len(matrix) == 1 and len(matrix[0]) == 1 and (
                    "приложение" in head or "қосымша" in head
                ):
                    continue
                for row in matrix:
                    parse_dsp_row([c.strip() for c in row], dsp_state, quarters)

    g3_idx = next(
        (i for i, t in enumerate(texts) if t.lower().startswith("глава 3") or t.lower().startswith("3-тарау")),
        None,
    )
    body_texts = texts[:g3_idx] if g3_idx is not None else texts
    raw_objs = parse_objectives_from_tables(p2_tables, True)
    objs4 = [o for o in raw_objs if o["code"].count(".") == 3]
    objs3 = [o for o in raw_objs if o["code"].count(".") == 2]
    if len(objs4) >= 8:
        objectives = objs4
    else:
        objectives = objs3 if len(objs3) > len(objs4) else raw_objs

    lang = subject_language(slug, file_lang)
    return {
        "skip": False,
        "order_number": "399",
        "order_date": "2022-09-16",
        "appendix_number": num,
        "subject_id": slug,
        "subject_name": name,
        "language": lang,
        "target_grades": grades,
        "direction": extract_direction(title + " " + head),
        "title": title,
        "legal_basis": extract_legal(body_texts),
        "goal_text": extract_goal(body_texts),
        "tasks": extract_tasks(body_texts),
        "hours": extract_hours_any(body_texts),
        "objectives": objectives,
        "quarters": [quarters[k] for k in sorted(quarters)],
        "stats": {
            "paras": len(texts),
            "p2_tables": len(p2_tables),
            "p3_quarters": len(quarters),
            "all_tables": table_count,
        },
    }


def main():
    results = []
    skipped = []
    catalog = []
    files = discover_files()
    if not files:
        catalog.append(f"MISSING folder {MAT}")
    for path, file_lang in files:
        print(f"FILE {path.name} lang={file_lang} …", file=sys.stderr, flush=True)
        chunks = split_documents(path)
        catalog.append(f"\nFILE {path.name} lang={file_lang} appendices={sorted({n for n,_ in chunks})}")
        print(f"  chunks={len(chunks)}", file=sys.stderr, flush=True)
        seen = set()
        for num, blocks in chunks:
            n_paras = sum(1 for b in blocks if isinstance(b, Paragraph) and ptext(b).strip())
            if n_paras <= 2:
                continue
            texts_head = [
                ptext(b).strip()
                for b in blocks
                if isinstance(b, Paragraph) and ptext(b).strip()
            ][:8]
            head_blob = " ".join(texts_head).lower()
            if n_paras <= 6 and "бағдарлама" not in head_blob and "типовая" not in head_blob:
                continue
            parsed = parse_chunk(num, blocks, file_lang)
            if not parsed:
                continue
            if parsed.get("skip"):
                skipped.append(f"  skip app={num} {parsed.get('reason')} title={parsed.get('title','')[:80]}")
                catalog.append(f"  SKIP {num} {parsed.get('reason')} {parsed.get('title','')[:90]}")
                continue
            ident = (parsed["subject_id"], parsed["target_grades"], parsed["direction"], parsed["language"], num)
            if ident in seen:
                continue
            seen.add(ident)
            results.append(parsed)
            catalog.append(
                f"  OK {num:>4} {parsed['subject_id']:<28} {parsed['target_grades']:<6} "
                f"{parsed['direction']:<6} {parsed['language']} "
                f"h={len(parsed['hours'])} t={len(parsed['tasks'])} "
                f"o={len(parsed['objectives'])} q={len(parsed['quarters'])}"
            )

    # Пара ЕМН + «common» на один предмет 10-11 — второй это ОГН без слова в заголовке.
    twins: dict[tuple, list] = {}
    for d in results:
        twins.setdefault((d["subject_id"], d["target_grades"], d["language"]), []).append(d)
    for items in twins.values():
        dirs = {x["direction"] for x in items}
        if len(items) == 2 and dirs == {"emn", "common"}:
            for x in items:
                if x["direction"] == "common":
                    x["direction"] = "ogn"

    # Номера приложений в казахской редакции те же, что в русской.
    canon = {
        (d["subject_id"], d["target_grades"], d["direction"]): d["appendix_number"]
        for d in results
        if d["language"] != "KZ"
    }
    for d in results:
        if d["language"] != "KZ":
            continue
        key = (d["subject_id"], d["target_grades"], d["direction"])
        if key in canon:
            d["appendix_number"] = canon[key]

    out = OUT / "all_tup_parsed.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "all_tup_catalog.txt").write_text("\n".join(catalog + [""] + skipped), encoding="utf-8")
    print(f"parsed={len(results)} skipped={len(skipped)} -> {out}", file=sys.stderr)
    print("\n".join(catalog), file=sys.stderr)


if __name__ == "__main__":
    main()

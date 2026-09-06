#!/usr/bin/env python3
"""Parse algebra/geometry TUPs from 399 order DOCX (2026-2027 edition)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.document import Document as DocumentType
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(r"E:\Projects\VectorWorkspace")
OUT = ROOT / "scripts" / "_399_extract"
OUT.mkdir(exist_ok=True)

DOCS = {
    "5-9": ROOT / "Materials" / "399 приказ 2026-2027" / "399 приказ 5-9 кл рус.docx",
    "10-11": ROOT / "Materials" / "399 приказ 2026-2027" / "399 приказ  10-11 кл рус.docx",
}

WANTED = {
    (53,): "algebra_7_9",
    (54,): "geometry_7_9",
    (104,): "algebra_analysis_10_11_emn",
    (105,): "algebra_analysis_10_11_ogn",
    (106,): "geometry_10_11_emn",
    (107,): "geometry_10_11_ogn",
}

APP_RE = re.compile(r"^\s*(?:Приложение|Қосымша|Косымша)\s+(\d+)\s*", re.I)
QUARTER_KZ_RE = re.compile(r"^(\d)\s*[-–—]?\s*тоқсан", re.I)
HOURS_RE = re.compile(
    r"в(?:о)?\s+(\d{1,2})(?:-ом)?\s+классе\s*(?:[-–—]|по)?\s*(\d+(?:[.,]\d+)?)\s*час"
    r".*?недел[юи].*?(\d+)\s*час",
    re.I,
)
CODE4_RE = re.compile(r"(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?!\d)")
CODE3_RE = re.compile(r"(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?!\.\d)")
QUARTER_RE = re.compile(r"^(\d)\s*[-–—]?\s*четверть", re.I)
GRADE_RE = re.compile(r"(?:^|[^\d])(\d{1,2})\s*-?\s*класс", re.I)
GRADE_MARK_RE = re.compile(r"(\d{1,2})\s*-?\s*класс", re.I)


def iter_blocks(doc: DocumentType):
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def ptext(p: Paragraph) -> str:
    return "".join(r.text or "" for r in p.runs) or (p.text or "")


def cell_text(cell) -> str:
    parts = []
    for p in cell.paragraphs:
        t = ptext(p).strip()
        if t:
            parts.append(t)
    return "\n".join(parts)


def table_matrix(table: Table) -> list[list[str]]:
    return [[cell_text(c) for c in row.cells] for row in table.rows]


def is_appendix(text: str) -> int | None:
    t = text.strip()
    if not t:
        return None
    # Ignore "приложение 102 к приказу" leftovers inside body
    m = APP_RE.match(t)
    if not m:
        kz = re.match(r"^\s*(?:№\s*\d+\s+)?(?:бұйрығына\s+)?(\d+)\s*-қосымша\s*$", t, re.I)
        if kz and len(t) < 80:
            return int(kz.group(1))
        return None
    rest = t[m.end() :].strip().lower()
    if rest and not rest.startswith("к приказу") and rest not in {"", "к"}:
        # e.g. "Приложение 53 к приказу..." is ok; long sentences are not
        if "типовая" in rest or "министр" in rest or rest.startswith("к"):
            return int(m.group(1))
        if "үлгілік" in rest or "бұйрық" in rest or rest.startswith("бұйрық"):
            return int(m.group(1))
        if len(t) > 80:
            return None
    return int(m.group(1))


def split_documents(path: Path):
    doc = Document(str(path))
    current_num = None
    current: list = []
    chunks: list[tuple[int, list]] = []
    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            n = is_appendix(ptext(block))
            if n is not None:
                # Колонтитул/остаток с тем же номером не начинает новый документ.
                if current_num is not None and n == current_num:
                    current.append(block)
                    continue
                if current_num is not None:
                    chunks.append((current_num, current))
                current_num = n
                current = [block]
                continue
        if current_num is not None:
            current.append(block)
    if current_num is not None:
        chunks.append((current_num, current))
    return chunks


def extract_hours(texts: list[str]) -> list[dict]:
    joined = " ".join(texts)
    hours = []
    seen = set()
    for m in HOURS_RE.finditer(joined):
        grade = int(m.group(1))
        if grade in seen:
            continue  # first block = основная нагрузка, not gymnasium
        seen.add(grade)
        hours.append(
            {
                "grade": grade,
                "hours_per_week": float(m.group(2).replace(",", ".")),
                "hours_per_year": int(m.group(3)),
            }
        )
    return hours


def extract_tasks(texts: list[str]) -> list[str]:
    joined = "\n".join(texts)
    idx = -1
    for key in ("Задачи:", "3. Задачи", "4. Задачи", "Задачи"):
        idx = joined.find(key)
        if idx >= 0:
            break
    if idx < 0:
        return []
    zone = joined[idx:]
    stop = re.search(r"\n\s*\d+\.\s+(?:Содержание|Базовое)", zone)
    if stop:
        zone = zone[: stop.start()]
    items = re.findall(r"(?:^|\n)\s*(\d{1,2})\)\s+(.+?)(?=(?:\n\s*\d{1,2}\))|\Z)", zone, re.S)
    tasks = []
    if items:
        for _n, body in items:
            t = re.sub(r"\s+", " ", body).strip().rstrip(";")
            if t and not t.lower().startswith("содержание"):
                tasks.append(t)
            if len(tasks) >= 12:
                break
        return tasks
    # OGN: unnumbered sentences after «Задачи:»
    body = zone.split(":", 1)[-1]
    for part in re.split(r"(?<=[.;])\s+", re.sub(r"\s+", " ", body)):
        t = part.strip().rstrip(";")
        if len(t) > 40:
            tasks.append(t)
        if len(tasks) >= 12:
            break
    return tasks


def extract_goal(texts: list[str]) -> str:
    for t in texts:
        m = re.search(
            r"(?:Цель обучения|Цель преподавания|3\.\s*Цель|2\.\s*Цель обучения|2\.\s*Цель)[:\s–—-]*(.+)",
            t,
            re.I,
        )
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
    # fallback: paragraph starting with "Цель:"
    for t in texts:
        if t.lower().startswith("цель:"):
            return re.sub(r"\s+", " ", t.split(":", 1)[1]).strip()
    return ""


def extract_legal(texts: list[str]) -> str:
    for t in texts:
        if "Государственн" in t and "348" in t:
            return re.sub(r"\s+", " ", t).strip()
    return ""


def _next_code_span(text: str, start: int) -> re.Match | None:
    m4 = CODE4_RE.search(text, start)
    m3 = CODE3_RE.search(text, start)
    if m4 and (not m3 or m4.start() <= m3.start()):
        return m4
    return m3


def parse_objectives_from_tables(tables: list[list[list[str]]], allow_three: bool) -> list[dict]:
    objs = []
    seen = set()
    for matrix in tables:
        for row in matrix:
            for cell in row:
                pos = 0
                while True:
                    m = _next_code_span(cell, pos)
                    if not m:
                        break
                    is4 = m.re is CODE4_RE or (m.lastindex == 4)
                    # distinguish: CODE4 has 4 groups
                    if len(m.groups()) == 4:
                        grade = int(m.group(1))
                        sec = int(m.group(2))
                        sub = int(m.group(3))
                        objn = int(m.group(4))
                        code = f"{grade}.{sec}.{sub}.{objn}"
                        key = (grade, sec, sub, objn)
                    else:
                        if not allow_three:
                            pos = m.end()
                            continue
                        after = cell[m.end() : m.end() + 2]
                        if after.startswith("."):
                            pos = m.end()
                            continue
                        grade, sec, objn = int(m.group(1)), int(m.group(2)), int(m.group(3))
                        code = f"{grade}.{sec}.{objn}"
                        key = (grade, sec, 1, objn)
                    rest = cell[m.end() :]
                    nxt = _next_code_span(rest, 0)
                    desc = rest[: nxt.start()] if nxt else rest
                    desc = re.sub(r"\s+", " ", desc).strip()
                    desc = desc.strip(" \t\n.:–—-")
                    pos = m.end()
                    if key in seen:
                        continue
                    if not desc or desc.lower().startswith("класс"):
                        continue
                    seen.add(key)
                    objs.append(
                        {
                            "code": code,
                            "grade": grade,
                            "section_number": key[1],
                            "subsection_number": key[2],
                            "objective_number": key[3],
                            "description": desc,
                        }
                    )
    return objs


def parse_dsp_row(cells: list[str], state: dict, quarters: dict) -> None:
    current_grade = state["grade"]
    current_q = state["quarter"]
    current_section = state["section"]
    joined = " ".join(cells)

    def ensure():
        k = (state["grade"], state["quarter"])
        if k not in quarters:
            quarters[k] = {
                "grade": state["grade"],
                "quarter_number": state["quarter"],
                "sections": [],
            }
        return quarters[k]

    qm = None
    for c in cells:
        raw = c.replace("\n", " ").strip()
        m = QUARTER_RE.match(raw) or QUARTER_KZ_RE.match(raw)
        if m:
            qm = int(m.group(1))
            break
    if qm:
        state["quarter"] = qm
        state["section"] = ""
        ensure()
        return

    low = joined.lower()
    if any(
        h in low
        for h in (
            "содержание раздела",
            "цели обучения",
            "раздел долгосрочного",
            "обучающиеся должны",
            "оқу мақсат",
            "бөлімнің мазмұны",
            "ұзақ мерзімді",
        )
    ) and len(cells) <= 4 and all(len(c) < 90 for c in cells):
        return

    if len(cells) >= 3:
        section, topic, codes_cell = cells[0], cells[1], cells[2]
    elif len(cells) == 2:
        section, topic, codes_cell = current_section, cells[0], cells[1]
    else:
        return

    if section and section != topic:
        state["section"] = section
        current_section = section
    if not current_section:
        current_section = section or "Раздел"
        state["section"] = current_section
    topic = re.sub(r"\s+", " ", topic).strip()
    if not topic or topic.lower() in {"содержание раздела долгосрочного плана", "содержание"}:
        return

    codes = []
    for m in CODE4_RE.finditer(codes_cell):
        codes.append(f"{m.group(1)}.{m.group(2)}.{m.group(3)}.{m.group(4)}")
    if not codes:
        for m in CODE3_RE.finditer(codes_cell):
            after = codes_cell[m.end() : m.end() + 2]
            if after.startswith("."):
                continue
            codes.append(f"{m.group(1)}.{m.group(2)}.{m.group(3)}")
    uniq = []
    for c in codes:
        if c not in uniq:
            uniq.append(c)

    q = ensure()
    sec = next((s for s in q["sections"] if s["name"] == current_section), None)
    if sec is None:
        sec = {"name": current_section, "topics": []}
        q["sections"].append(sec)
    sec["topics"].append({"name": topic, "objective_codes": uniq})
    _ = current_grade, current_q


def parse_chunk(num: int, blocks: list, label: str) -> dict:
    texts: list[str] = []
    tables: list[list[list[str]]] = []
    p2_tables: list[list[list[str]]] = []
    zone = "p1"
    title = ""
    default_grade = 7 if "7_9" in label else 10
    dsp_state = {"grade": default_grade, "quarter": 1, "section": ""}
    quarters: dict[tuple[int, int], dict] = {}
    in_main_p3 = False

    for b in blocks:
        if isinstance(b, Paragraph):
            t = ptext(b).strip()
            if not t:
                continue
            texts.append(t)
            if t.startswith("Типовая учебная программа") and not title:
                title = t
            low = t.lower()
            if "параграф 2" in low and "систем" in low:
                zone = "p2"
                in_main_p3 = False
            elif "параграф 3" in low and "долгосроч" in low:
                if zone == "g3":
                    # гимназический ДСП — не смешиваем с основной программой
                    in_main_p3 = False
                    zone = "g3"
                else:
                    zone = "p3"
                    in_main_p3 = True
                    dsp_state = {"grade": default_grade, "quarter": 1, "section": ""}
            elif low.startswith("глава 3"):
                zone = "g3"
                in_main_p3 = False
            if in_main_p3:
                gm = GRADE_MARK_RE.search(t)
                if gm and len(t) < 40:
                    dsp_state["grade"] = int(gm.group(1))
                    dsp_state["quarter"] = 1
                    dsp_state["section"] = ""
        else:
            matrix = table_matrix(b)
            tables.append(matrix)
            if zone == "p2":
                p2_tables.append(matrix)
            elif in_main_p3:
                if len(matrix) == 1 and len(matrix[0]) == 1 and "приложение" in matrix[0][0].lower():
                    continue
                for row in matrix:
                    parse_dsp_row([c.strip() for c in row], dsp_state, quarters)

    allow_three = "geometry_10_11" in label
    g3_idx = next((i for i, t in enumerate(texts) if t.lower().startswith("глава 3")), None)
    hours = extract_hours(texts[:g3_idx] if g3_idx is not None else texts)

    return {
        "label": label,
        "appendix_number": num,
        "title": title,
        "order_number": "399",
        "order_date": "2022-09-16",
        "legal_basis": extract_legal(texts),
        "goal_text": extract_goal(texts),
        "tasks": extract_tasks(texts[:g3_idx] if g3_idx is not None else texts),
        "hours": hours,
        "objectives": parse_objectives_from_tables(p2_tables, allow_three),
        "quarters": [quarters[k] for k in sorted(quarters)],
        "stats": {
            "paras": len(texts),
            "p2_tables": len(p2_tables),
            "p3_quarters": len(quarters),
            "all_tables": len(tables),
        },
    }


def main():
    results = []
    summary = []
    for key, path in DOCS.items():
        print(f"FILE {path.name} exists={path.exists()}", file=sys.stderr)
        chunks = split_documents(path)
        print(f"  appendices found: {sorted({n for n, _ in chunks})}", file=sys.stderr)
        for num, blocks in chunks:
            label = WANTED.get((num,))
            if not label:
                continue
            n_paras = sum(
                1 for b in blocks if isinstance(b, Paragraph) and ptext(b).strip()
            )
            if n_paras <= 2:
                continue
            parsed = parse_chunk(num, blocks, label)
            results.append(parsed)
            s = (
                f"{label} app={num} hours={parsed['hours']} "
                f"tasks={len(parsed['tasks'])} objs={len(parsed['objectives'])} "
                f"quarters={len(parsed['quarters'])} {parsed['stats']}"
            )
            summary.append(s)
            print(s, file=sys.stderr)

    out_json = OUT / "math_tup_parsed.json"
    out_json.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "math_tup_summary.txt").write_text("\n".join(summary), encoding="utf-8")
    print(f"wrote {out_json}", file=sys.stderr)


if __name__ == "__main__":
    main()

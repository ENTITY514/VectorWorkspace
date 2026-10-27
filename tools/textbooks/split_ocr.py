"""Режет распознанный учебник (ответы Gemini, склеенные в один .md) по страницам.

Вход:  <ocr_dir>/<slug>.md с разделителями «=== стр. N ===».
Выход: <ocr_dir>/<slug>/pNNN.md и сводка: покрытые страницы, пропуски, дубли,
        страницы без упражнений и с нераспознанными символами [?].

    python -X utf8 tools/textbooks/split_ocr.py "H:/КТП/2026-2027/КТП/Книги/ocr" alg8 4 54
"""
import os
import re
import sys

MARK = re.compile(r"^=+\s*стр\.\s*(\d+)\s*=+\s*$", re.M)
EXERCISE = re.compile(r"^\*\*\d+\.\d+\.\*\*", re.M)
SERVICE = re.compile(r"^ГОТОВО:.*$", re.M)


def split(text: str) -> dict[int, str]:
    pages: dict[int, str] = {}
    marks = list(MARK.finditer(text))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        body = SERVICE.sub("", text[m.end():end]).strip()
        page = int(m.group(1))
        # Повтор страницы (Gemini иногда дублирует при «дальше») — берём более полную версию.
        if len(body) > len(pages.get(page, "")):
            pages[page] = body
    return pages


def main() -> None:
    ocr_dir, slug = sys.argv[1], sys.argv[2]
    lo, hi = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (None, None)
    with open(os.path.join(ocr_dir, f"{slug}.md"), encoding="utf8") as fh:
        pages = split(fh.read())
    out = os.path.join(ocr_dir, slug)
    os.makedirs(out, exist_ok=True)
    for page, body in pages.items():
        with open(os.path.join(out, f"p{page:03d}.md"), "w", encoding="utf8") as fh:
            fh.write(body + "\n")

    got = sorted(pages)
    print(f"{slug}: {len(got)} стр. ({got[0]}–{got[-1]})" if got else f"{slug}: страниц нет")
    if lo is not None:
        missing = [p for p in range(lo, hi + 1) if p not in pages]
        print("  пропущены:", missing or "нет")
    empty = [p for p in got if not EXERCISE.search(pages[p])]
    unsure = [p for p in got if "[?]" in pages[p]]
    print("  без упражнений (теория/иллюстрации — проверить):", empty or "нет")
    print("  с [?]:", unsure or "нет")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Страж целостности БД.

Запрещает скриптам, мутирующим таблицу `tup_documents`, действовать вслепую.
Любой такой скрипт обязан:
  1. доказать, что ключ обновления уникален (маркер `UNIQUENESS_VERIFIED`) —
     иначе он может схлопнуть несколько приложений ТУП в одно значение;
  2. снять точку возврата перед мутацией (маркер `BACKUP_TAKEN`) — иначе
     при ошибке нечего будет восстановить.

Маркеры ставятся в файл скрипта и подтверждают наличие соответствующей логики.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MUTATION_PATTERNS = [
    re.compile(r"UPDATE\s+tup_documents", re.IGNORECASE),
    re.compile(r"DELETE\s+FROM\s+tup_documents", re.IGNORECASE),
    re.compile(r"reimport", re.IGNORECASE),
]
REQUIRED_MARKERS = ["UNIQUENESS_VERIFIED", "BACKUP_TAKEN"]

SKIP_DIRS = {"node_modules", "target", ".git"}


def scan():
    offenders = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith(".py"):
                continue
            path = os.path.join(dirpath, fn)
            try:
                text = open(path, encoding="utf-8").read()
            except Exception:
                continue
            if any(p.search(text) for p in MUTATION_PATTERNS):
                missing = [m for m in REQUIRED_MARKERS if m not in text]
                if missing:
                    offenders.append((os.path.relpath(path, ROOT), missing))
    return offenders


def main():
    offenders = scan()
    if offenders:
        print("НАРУШЕНИЕ: мутирующие tup_documents скрипты без обязательных маркеров:")
        for path, missing in offenders:
            print(f"  - {path}  (не хватает: {', '.join(missing)})")
        print(f"\nДобавьте маркеры {REQUIRED_MARKERS} и реализуйте проверку уникальности ключа и бэкап БД.")
        sys.exit(1)
    print("OK: все мутирующие tup_documents скрипты подтверждают уникальность ключа и снимок БД.")


if __name__ == "__main__":
    main()

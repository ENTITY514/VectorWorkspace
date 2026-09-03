import sys
import json

# Контракт с Rust — строго UTF-8. Без этого на русской Windows stdout
# открывается в cp1251, и любой ответ с «×» или казахскими буквами
# роняет процесс UnicodeEncodeError ещё до того, как Rust его прочитает.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # поток подменён или уже закрыт
        pass

try:  # запуск как пакет: python -m solver
    from solver.schema import InputModel, OutputModel, SCHEMA_VERSION
    from solver.engine import solve
except ImportError:  # запуск как скрипт: python solver/__main__.py
    from schema import InputModel, OutputModel, SCHEMA_VERSION
    from engine import solve


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        sys.stderr.write("INVALID_INPUT: empty stdin\n")
        sys.exit(2)
    try:
        inp = InputModel.model_validate_json(raw)
    except Exception as e:
        sys.stderr.write(f"INVALID_INPUT: {e}\n")
        # также пробуем вернуть JSON на stdout чтобы Rust не вис
        err_out = {
            "schema_version": SCHEMA_VERSION,
            "status": "INVALID_INPUT",
            "solver_stats": {"wall_ms": 0, "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0},
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0, "total": 0},
            "slots": [],
            "diagnostics": {"infeasible_core": None, "warnings": [str(e)]},
        }
        sys.stdout.write(json.dumps(err_out, ensure_ascii=False))
        sys.exit(2)
    try:
        out = solve(inp)
        OutputModel.model_validate(out)
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"SOLVER_ERROR: {e}\n")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

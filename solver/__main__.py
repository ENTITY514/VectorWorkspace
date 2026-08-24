import sys
import json

from schema import InputModel, OutputModel
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
            "schema_version": 1,
            "status": "INVALID_INPUT",
            "solver_stats": {"wall_ms": 0, "branches": 0, "conflicts": 0, "gap_percent": 0.0, "objective_value": 0},
            "penalties": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0, "alternation": 0, "movement": 0, "load_balance": 0, "total": 0},
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

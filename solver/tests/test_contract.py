"""Регрессии на дефекты контракта Rust <-> Python.

Каждый тест закрывает баг, из-за которого продуктовый путь генерации не
работал, тогда как скрипты работали: они вызывают solve() напрямую и потому
контракта не касаются.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / "solver" / "__main__.py"

from solver.engine import solve  # noqa: E402
from solver.schema import SCHEMA_VERSION, InputModel  # noqa: E402


def _row():
    return [True] * 8


def _base_input(**over):
    data = {
        "schema_version": SCHEMA_VERSION,
        "meta": {"time_limit_sec": 10, "num_workers": 2, "random_seed": 42},
        "time_grid": {"days": 5, "periods_per_day": 7},
        "teachers": [
            {"id": "t1", "full_name": "Иванова Мария", "max_daily_lessons": 0,
             "availability": [_row()] * 6, "subject_ids": []},
        ],
        "classes": [
            {"id": "c1", "grade": 7, "letter": "Б", "headcount": 20,
             "shift": "First", "subgroups": []},
        ],
        "rooms": [{"id": "r1", "name": "Кабинет 1", "room_type": "General", "capacity": 30}],
        "subjects": [{"id": "hist", "name": "История", "sanitary_weight": 8}],
        "curriculum": [
            {"class_id": "c1", "subject_id": "hist", "teacher_id": "t1", "hours_per_week": 2},
        ],
        "weights": {"window": 0, "room_displacement": 0, "sanpin_parabola": 0,
                    "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 0},
    }
    data.update(over)
    return data


def _run_subprocess(payload: dict) -> dict:
    """Прогоняет контракт через реальный stdin/stdout, как это делает Rust."""
    proc = subprocess.run(
        [sys.executable, str(MAIN)],
        input=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        capture_output=True,
    )
    assert proc.returncode in (0, 1, 2), proc.stderr.decode("utf-8", "replace")
    return json.loads(proc.stdout.decode("utf-8"))


def test_cyrillic_survives_stdin_roundtrip():
    """Кириллица во входе не должна ронять солвер.

    Рантайм Windows открывает stdin в cp1251, поэтому JSON с русскими ФИО
    не разбирался и генерация из приложения возвращала INVALID_INPUT. На
    латинских тестовых данных дефект был не виден.
    """
    out = _run_subprocess(_base_input())
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert len(out["slots"]) == 2


def test_infeasible_diagnostics_with_non_ascii_reason():
    """Ответ с «×» в тексте причины не должен ронять stdout.

    build_infeasible_core формирует «N каб. × M слотов»; при stdout в cp1251
    процесс падал UnicodeEncodeError до того, как Rust читал ответ.
    """
    payload = _base_input(
        rooms=[],
        subjects=[{"id": "chem", "name": "Химия", "sanitary_weight": 9,
                   "required_room_type": "ChemistryLab"}],
        curriculum=[{"class_id": "c1", "subject_id": "chem", "teacher_id": "t1",
                     "hours_per_week": 1}],
    )
    out = _run_subprocess(payload)
    assert out["status"] == "INFEASIBLE", out
    assert out["diagnostics"]["infeasible_core"] is not None


def test_schema_version_is_same_on_success_and_failure():
    """Версия контракта одинакова на всех ветках возврата.

    Раньше успех возвращал 1, а INFEASIBLE — 2, и Rust, требовавший ровно 1,
    превращал любую диагностику в InvalidContract.
    """
    ok = _run_subprocess(_base_input())
    bad = _run_subprocess(_base_input(
        rooms=[],
        subjects=[{"id": "chem", "name": "Химия", "sanitary_weight": 9,
                   "required_room_type": "ChemistryLab"}],
        curriculum=[{"class_id": "c1", "subject_id": "chem", "teacher_id": "t1",
                     "hours_per_week": 1}],
    ))
    assert ok["schema_version"] == bad["schema_version"] == SCHEMA_VERSION


def test_joint_lessons_are_synchronised():
    """Классы одной joint-группы стоят в одном слоте."""
    payload = _base_input(
        classes=[
            {"id": "c1", "grade": 7, "letter": "Б", "headcount": 20, "shift": "First", "subgroups": []},
            {"id": "c1_luo", "grade": 7, "letter": "В", "headcount": 5, "shift": "First", "subgroups": []},
        ],
        curriculum=[
            {"class_id": "c1", "subject_id": "hist", "teacher_id": "t1",
             "hours_per_week": 2, "joint_lesson_id": "jl_a"},
            {"class_id": "c1_luo", "subject_id": "hist", "teacher_id": "t1",
             "hours_per_week": 2, "joint_lesson_id": "jl_a"},
        ],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    by_slot = {}
    for s in out["slots"]:
        by_slot.setdefault((s["day"], s["period"]), set()).add(s["class_id"])
    assert by_slot, "решение пустое"
    for classes in by_slot.values():
        assert classes == {"c1", "c1_luo"}, f"joint-группа рассыпалась: {by_slot}"


def test_fixed_lesson_is_respected():
    """Закреплённый пользователем слот присутствует в решении."""
    payload = _base_input(
        fixed_lessons=[{
            "lesson_idx": 0, "class_id": "c1", "subject_id": "hist",
            "teacher_id": "t1", "room_id": "r1", "day": 2, "period": 1,
        }],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert any(s["day"] == 2 and s["period"] == 1 for s in out["slots"]), out["slots"]


def test_previous_grid_uses_string_keys():
    """change_slot считается по строковым ключам, как приходит из JSON.

    soft.py искал ключ по кортежу, которого в JSON-словаре быть не может,
    поэтому штраф «минимального возмущения» не работал никогда.
    """
    payload = _base_input(
        previous_grid={"c1|hist|t1|0|0": "r1"},
        weights={"window": 0, "room_displacement": 0, "sanpin_parabola": 0,
                 "alternation": 0, "movement": 0, "load_balance": 0, "change_slot": 100},
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert "change_slot" in out["penalties"]


def test_timeout_is_not_reported_as_infeasible():
    """Таймаут обязан приходить как TIME_LIMIT.

    Ветка «решение не найдено» жёстко возвращала INFEASIBLE, из-за чего
    нехватка времени выглядела как доказанная невозможность расписания.
    """
    from solver import engine

    payload = _base_input()
    model = InputModel.model_validate(payload)

    class _FakeSolver:
        def __init__(self):
            self.parameters = type("P", (), {})()
        def Solve(self, _m):
            from ortools.sat.python import cp_model
            return cp_model.UNKNOWN
        def NumBranches(self):
            return 0
        def NumConflicts(self):
            return 0

    original = engine.cp_model.CpSolver
    engine.cp_model.CpSolver = _FakeSolver
    try:
        out = engine.solve(model)
    finally:
        engine.cp_model.CpSolver = original

    assert out["status"] == "TIME_LIMIT", out["status"]
    assert out["diagnostics"]["infeasible_core"] is None
    assert any("TIME_LIMIT" in w for w in out["diagnostics"]["warnings"])


def test_room_conflict_constraint_is_enforced_by_default():
    """Два класса не делят кабинет: H4b больше не отключается молча."""
    payload = _base_input(
        teachers=[
            {"id": "t1", "full_name": "T1", "max_daily_lessons": 0, "availability": [_row()] * 6, "subject_ids": []},
            {"id": "t2", "full_name": "T2", "max_daily_lessons": 0, "availability": [_row()] * 6, "subject_ids": []},
        ],
        classes=[
            {"id": "c1", "grade": 7, "letter": "А", "headcount": 20, "shift": "First", "subgroups": []},
            {"id": "c2", "grade": 7, "letter": "Б", "headcount": 20, "shift": "First", "subgroups": []},
        ],
        rooms=[{"id": "r1", "name": "Кабинет 1", "room_type": "General", "capacity": 30}],
        time_grid={"days": 1, "periods_per_day": 2},
        curriculum=[
            {"class_id": "c1", "subject_id": "hist", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "c2", "subject_id": "hist", "teacher_id": "t2", "hours_per_week": 1},
        ],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    used = {(s["room_id"], s["day"], s["period"]) for s in out["slots"]}
    assert len(used) == len(out["slots"]), f"кабинет занят дважды: {out['slots']}"


def test_relaxing_room_constraint_emits_warning():
    """Ослабление ограничения обязано быть видимым в диагностике."""
    payload = _base_input(policy={"enforce_room_conflicts": False})
    out = solve(InputModel.model_validate(payload))
    assert any("ROOM_CONFLICTS_NOT_ENFORCED" in w for w in out["diagnostics"]["warnings"]), out


def test_home_schooling_takes_no_room():
    """Надомное обучение (ДО) не занимает кабинет.

    Урок проходит у ученика дома. Раньше движок подставлял ему «первый
    попавшийся» кабинет, и занятие ложно конкурировало за помещение с
    очными уроками.
    """
    payload = _base_input(
        classes=[
            {"id": "c1", "grade": 7, "letter": "Б", "headcount": 20,
             "shift": "First", "subgroups": [], "class_type": "normal"},
            {"id": "d1", "grade": 8, "letter": "", "headcount": 1,
             "shift": "First", "subgroups": [], "class_type": "do"},
        ],
        teachers=[
            {"id": "t1", "full_name": "Иванова", "max_daily_lessons": 0,
             "availability": [_row()] * 6, "subject_ids": []},
            {"id": "t2", "full_name": "Петрова", "max_daily_lessons": 0,
             "availability": [_row()] * 6, "subject_ids": []},
        ],
        curriculum=[
            {"class_id": "c1", "subject_id": "hist", "teacher_id": "t1", "hours_per_week": 2},
            {"class_id": "d1", "subject_id": "hist", "teacher_id": "t2", "hours_per_week": 2},
        ],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    for s in out["slots"]:
        if s["class_id"] == "d1":
            assert s["room_id"] is None, f"надомный урок занял кабинет: {s}"
        else:
            assert s["room_id"] == "r1", s


def test_home_schooling_does_not_block_rooms():
    """Надомные уроки не отнимают кабинет у очных занятий.

    Один кабинет на два одновременных урока: очный занимает его, надомный
    проходит дома. Без этого правила задача была бы неразрешима.

    Периодов два, а не один: политика запрещает спецклассам последний урок
    дня, и при единственном периоде размещать надомный урок было бы негде.
    """
    payload = _base_input(
        time_grid={"days": 1, "periods_per_day": 2},
        classes=[
            {"id": "c1", "grade": 7, "letter": "Б", "headcount": 20,
             "shift": "First", "subgroups": [], "class_type": "normal"},
            {"id": "d1", "grade": 8, "letter": "", "headcount": 1,
             "shift": "First", "subgroups": [], "class_type": "do"},
        ],
        teachers=[
            {"id": "t1", "full_name": "Иванова", "max_daily_lessons": 0,
             "availability": [_row()] * 6, "subject_ids": []},
            {"id": "t2", "full_name": "Петрова", "max_daily_lessons": 0,
             "availability": [_row()] * 6, "subject_ids": []},
        ],
        curriculum=[
            {"class_id": "c1", "subject_id": "hist", "teacher_id": "t1", "hours_per_week": 1},
            {"class_id": "d1", "subject_id": "hist", "teacher_id": "t2", "hours_per_week": 1},
        ],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert len(out["slots"]) == 2, out["slots"]
    rooms_used = [s["room_id"] for s in out["slots"] if s["class_id"] == "c1"]
    assert rooms_used == ["r1"], out["slots"]


def test_class_type_not_guessed_from_id():
    """Тип класса берётся из данных, а не из подстроки в идентификаторе.

    Проверка `"do" in class_id` срабатывала на обычных классах вида
    «9а_dopolnitelnaya» и ошибочно запрещала им последний урок.
    """
    payload = _base_input(
        time_grid={"days": 1, "periods_per_day": 2},
        classes=[
            {"id": "9a_dopolnitelnaya", "grade": 9, "letter": "а", "headcount": 25,
             "shift": "First", "subgroups": [], "class_type": "normal"},
        ],
        curriculum=[
            {"class_id": "9a_dopolnitelnaya", "subject_id": "hist",
             "teacher_id": "t1", "hours_per_week": 2},
        ],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    # Оба урока размещены, включая последний в дне.
    assert len(out["slots"]) == 2, out["slots"]
    assert any(s["period"] == 1 for s in out["slots"]), out["slots"]


def test_luo_class_has_no_last_period():
    """Классу ЛУО последний урок дня не ставится."""
    payload = _base_input(
        time_grid={"days": 5, "periods_per_day": 3},
        classes=[
            {"id": "5_luo", "grade": 5, "letter": "", "headcount": 10,
             "shift": "First", "subgroups": [], "class_type": "luo"},
        ],
        curriculum=[
            {"class_id": "5_luo", "subject_id": "hist", "teacher_id": "t1", "hours_per_week": 2},
        ],
    )
    out = solve(InputModel.model_validate(payload))
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), out
    assert all(s["period"] != 2 for s in out["slots"]), out["slots"]

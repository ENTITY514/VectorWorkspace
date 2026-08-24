"""Soft constraints S1..S6 (Phase 3) — MVP заглушка, возвращает пустой penalties."""
from ortools.sat.python import cp_model


def add_soft_constraints(model, x, y, m, instances):
    """
    Phase 2: возвращаем пустой dict — веса игнорируются, objective 0.
    Phase 3: здесь будут S1..S6 + model.Minimize.
    """
    # MVP: если веса ненулевые, но Soft ещё не реализован — штраф 0, solver всё равно найдёт FEASIBLE
    # Чтобы не ломать контракт, возвращаем пустой словарь, вызывающий код не добавляет Minimize
    return {}

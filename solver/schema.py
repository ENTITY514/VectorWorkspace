"""Pydantic v2 JSON contract schema_version=2 (Rust <-> Python)."""
from __future__ import annotations

#: Единственный источник истины по версии контракта Rust <-> Python.
#: Меняется ТОЛЬКО вместе с contracts/ и проверкой на стороне Rust.
SCHEMA_VERSION = 2

#: Версии входа, которые солвер ещё умеет принимать.
SUPPORTED_INPUT_VERSIONS = (1, 2)

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class Meta(BaseModel):
    school_name: str = "Школа"
    generated_at: str = ""
    time_limit_sec: int = Field(default=60, ge=1, le=600)
    num_workers: int = Field(default=8, ge=1, le=16)
    random_seed: int = 42


class TimeGrid(BaseModel):
    days: int = Field(ge=1, le=7)
    periods_per_day: int = Field(ge=1, le=10)
    shift_boundaries: Optional[dict] = None
    #: Урок, с которого начинается вторая смена. None — школа односменная.
    shift_boundary_period: Optional[int] = Field(default=None, ge=1, le=9)


class TeacherInput(BaseModel):
    id: str
    full_name: str
    base_room_id: Optional[str] = None
    max_daily_lessons: int = Field(ge=0, le=10)
    availability: list[list[bool]]  # [day][period]
    subject_ids: list[str] = Field(default_factory=list)
    is_combined: bool = False

    @field_validator("availability")
    @classmethod
    def validate_avail(cls, v):
        if len(v) != 6:
            raise ValueError(f"availability: expected 6 days, got {len(v)}")
        for d, row in enumerate(v):
            if len(row) != 8:
                raise ValueError(f"availability day {d}: expected 8 periods, got {len(row)}")
        return v


class ClassInput(BaseModel):
    id: str
    grade: int = Field(ge=1, le=11)
    letter: str
    headcount: int = Field(ge=1, le=50)
    shift: Literal["First", "Second"]
    subgroups: list[dict] = Field(default_factory=list)
    #: Тип класса. Раньше ЛУО/ДО определялись по подстроке в идентификаторе
    #: ("do" in class_id), что срабатывало ложно на обычных классах.
    class_type: str = "normal"


class RoomInput(BaseModel):
    id: str
    name: str
    room_type: str
    capacity: int = Field(ge=1, le=200)
    floor: Optional[int] = Field(default=None, ge=1, le=5)


class SubjectInput(BaseModel):
    id: str
    name: str
    sanitary_weight: int = Field(ge=1, le=10)
    required_room_type: Optional[str] = None
    requires_split: bool = False
    is_double_allowed: bool = False
    related_subject_ids: list[str] = Field(default_factory=list)


class CurriculumEntry(BaseModel):
    class_id: str
    subject_id: str
    teacher_id: str
    split_teacher2_id: Optional[str] = None
    hours_per_week: int = Field(ge=1, le=6)
    joint_lesson_id: Optional[str] = None

    @model_validator(mode="after")
    def check_split(self):
        if self.split_teacher2_id is not None and self.split_teacher2_id == self.teacher_id:
            raise ValueError("split teachers must be distinct")
        return self


class Weights(BaseModel):
    window: int = Field(ge=0, le=1000)
    room_displacement: int = Field(ge=0, le=1000)
    sanpin_parabola: int = Field(ge=0, le=1000)
    alternation: int = Field(ge=0, le=1000)
    movement: int = Field(ge=0, le=1000)
    load_balance: int = Field(ge=0, le=1000)
    change_slot: int = Field(default=0, ge=0, le=1000)


class FixedLesson(BaseModel):
    """Фиксированный (закреплённый пользователем) слот."""
    lesson_idx: int = Field(ge=0)
    class_id: str
    subject_id: str
    teacher_id: str
    room_id: str
    day: int = Field(ge=0, le=5)
    period: int = Field(ge=0, le=7)
    subgroup_label: Optional[str] = None
    joint_lesson_id: Optional[str] = None


class SchedulePolicy(BaseModel):
    """Правила школы, влияющие на постановку задачи.

    Заведено, чтобы ослабление ограничений было ЯВНЫМ. Раньше жёсткое
    ограничение по кабинетам молча отключалось эвристикой на больших моделях,
    и пользователь получал расписание с накладками, не зная об этом.
    """
    #: Запрещать ли двум занятиям делить кабинет в одном слоте.
    enforce_room_conflicts: bool = True

    #: Типы классов, которым кабинет не нужен вовсе.
    #: Надомное обучение (ДО) проходит у ученика дома: такой урок не занимает
    #: кабинет и не должен конкурировать за него с очными занятиями.
    roomless_class_types: list[str] = Field(default_factory=lambda: ["do"])

    #: Типы классов, которым нельзя ставить последний урок дня.
    no_last_period_class_types: list[str] = Field(default_factory=lambda: ["luo", "do"])


class InputModel(BaseModel):
    schema_version: Literal[1, 2] = 1
    meta: Meta = Field(default_factory=Meta)
    time_grid: TimeGrid
    teachers: list[TeacherInput]
    classes: list[ClassInput]
    rooms: list[RoomInput]
    subjects: list[SubjectInput]
    curriculum: list[CurriculumEntry]
    weights: Weights = Field(default_factory=Weights)
    policy: SchedulePolicy = Field(default_factory=SchedulePolicy)
    fixed_lessons: list[FixedLesson] = Field(default_factory=list)
    previous_grid: Optional[dict] = None


class SlotOutput(BaseModel):
    class_id: str
    subject_id: str
    teacher_id: str
    room_id: str
    subgroup_label: Optional[str] = None
    day: int = Field(ge=0, le=5)
    period: int = Field(ge=0, le=7)
    joint_lesson_id: Optional[str] = None


class Penalties(BaseModel):
    window: int = 0
    room_displacement: int = 0
    sanpin_parabola: int = 0
    alternation: int = 0
    movement: int = 0
    load_balance: int = 0
    change_slot: int = 0
    total: int = 0


class SolverStats(BaseModel):
    wall_ms: int = 0
    branches: int = 0
    conflicts: int = 0
    gap_percent: float = 0.0
    objective_value: int = 0


class InfeasibleCore(BaseModel):
    reason: str
    conflicting_entities: list[str] = Field(default_factory=list)
    suggestion: str = ""


class Diagnostics(BaseModel):
    infeasible_core: Optional[InfeasibleCore] = None
    warnings: list[str] = Field(default_factory=list)


class OutputModel(BaseModel):
    schema_version: Literal[1, 2] = 2
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "TIME_LIMIT", "INVALID_INPUT"]
    solver_stats: SolverStats = Field(default_factory=SolverStats)
    penalties: Penalties = Field(default_factory=Penalties)
    slots: list[SlotOutput] = Field(default_factory=list)
    diagnostics: Diagnostics = Field(default_factory=Diagnostics)

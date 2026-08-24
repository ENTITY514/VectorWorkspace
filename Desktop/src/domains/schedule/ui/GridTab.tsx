import { useMemo, useState } from "react";
import type { ScheduleState, ScheduleSlot, Shift } from "../../../types";
import { SHIFT_LABELS } from "../../../types";

interface FilterState {
  days: number[];
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
  shift: Shift | "";
  subgroup: string;
}

const INITIAL_FILTERS: FilterState = {
  days: [],
  class_id: "",
  subject_id: "",
  teacher_id: "",
  room_id: "",
  shift: "",
  subgroup: "",
};

const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб"];

function getCurrentDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 5 : d - 1;
}

function hasWindowsForTeacher(slots: ScheduleSlot[], teacherId: string, day: number): boolean {
  const teacherSlots = slots
    .filter(s => s.teacher_id === teacherId && s.day === day)
    .map(s => s.period)
    .sort((a, b) => a - b);
  if (teacherSlots.length < 2) return false;
  for (let i = 1; i < teacherSlots.length; i++) {
    if (teacherSlots[i] - teacherSlots[i - 1] > 1) return true;
  }
  return false;
}

export function GridTab({ state }: { state: ScheduleState }) {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  const teachers = useMemo(() => {
    const ids = new Set(state.slots.map(s => s.teacher_id));
    return Array.from(ids).sort();
  }, [state.slots]);

  const classes = useMemo(() => {
    const ids = new Set(state.slots.map(s => s.class_id));
    return Array.from(ids).sort();
  }, [state.slots]);

  const subjects = useMemo(() => {
    const ids = new Set(state.slots.map(s => s.subject_id));
    return Array.from(ids).sort();
  }, [state.slots]);

  const rooms = useMemo(() => {
    const ids = new Set(state.slots.map(s => s.room_id));
    return Array.from(ids).sort();
  }, [state.slots]);

  const filteredSlots = useMemo(() => {
    return state.slots.filter(s => {
      if (filters.days.length > 0 && !filters.days.includes(s.day)) return false;
      if (filters.class_id && s.class_id !== filters.class_id) return false;
      if (filters.subject_id && s.subject_id !== filters.subject_id) return false;
      if (filters.teacher_id && s.teacher_id !== filters.teacher_id) return false;
      if (filters.room_id && s.room_id !== filters.room_id) return false;
      if (filters.subgroup && s.subgroup_label !== filters.subgroup) return false;
      if (filters.shift) {
        const cls = state.classes.find(c => c.id === s.class_id);
        if (cls && cls.shift !== filters.shift) return false;
      }
      return true;
    });
  }, [state.slots, state.classes, filters]);

  const windowsByTeacher = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const s of state.slots) {
      if (hasWindowsForTeacher(state.slots, s.teacher_id, s.day)) {
        if (!map.has(s.teacher_id)) map.set(s.teacher_id, new Set());
        map.get(s.teacher_id)!.add(s.day);
      }
    }
    return map;
  }, [state.slots]);

  const activeFilters: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.days.length > 0) {
    for (const d of filters.days) {
      activeFilters.push({
        key: `day-${d}`,
        label: DAY_NAMES[d],
        onRemove: () => setFilters(f => ({ ...f, days: f.days.filter(x => x !== d) })),
      });
    }
  }
  if (filters.class_id) activeFilters.push({ key: "class", label: `Класс: ${filters.class_id}`, onRemove: () => setFilters(f => ({ ...f, class_id: "" })) });
  if (filters.subject_id) activeFilters.push({ key: "subject", label: `Предмет: ${filters.subject_id}`, onRemove: () => setFilters(f => ({ ...f, subject_id: "" })) });
  if (filters.teacher_id) activeFilters.push({ key: "teacher", label: `Учитель: ${filters.teacher_id}`, onRemove: () => setFilters(f => ({ ...f, teacher_id: "" })) });
  if (filters.room_id) activeFilters.push({ key: "room", label: `Кабинет: ${filters.room_id}`, onRemove: () => setFilters(f => ({ ...f, room_id: "" })) });
  if (filters.shift) activeFilters.push({ key: "shift", label: `Смена: ${SHIFT_LABELS[filters.shift as Shift]}`, onRemove: () => setFilters(f => ({ ...f, shift: "" })) });
  if (filters.subgroup) activeFilters.push({ key: "subgroup", label: `Подгруппа: ${filters.subgroup}`, onRemove: () => setFilters(f => ({ ...f, subgroup: "" })) });

  const hasActiveFilters = activeFilters.length > 0;

  const toggleDay = (d: number) => {
    setFilters(f => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d],
    }));
  };

  const applyPreset = (preset: "myday" | "first" | "second" | "nowindows") => {
    switch (preset) {
      case "myday":
        setFilters({ ...INITIAL_FILTERS, days: [getCurrentDayIndex()] });
        break;
      case "first":
        setFilters({ ...INITIAL_FILTERS, shift: "First" });
        break;
      case "second":
        setFilters({ ...INITIAL_FILTERS, shift: "Second" });
        break;
      case "nowindows": {
        const teachersWithWindows = new Set<string>();
        for (const [tId, days] of windowsByTeacher) {
          for (const d of days) {
            teachersWithWindows.add(`${tId}-${d}`);
          }
        }
        setFilters(INITIAL_FILTERS);
        break;
      }
    }
  };

  if (state.slots.length === 0) {
    return <div className="card"><p className="muted">Пусто — сгенерируйте расписание на вкладке Сводка.</p></div>;
  }

  return (
    <div className="card">
      <h3>Матрица расписания</h3>

      <div className="filter-bar">
        <div className="filter-presets">
          <span className="filter-label">Быстрые:</span>
          <button className="btn btn-small" onClick={() => applyPreset("myday")}>Мой день</button>
          <button className="btn btn-small" onClick={() => applyPreset("first")}>Первая смена</button>
          <button className="btn btn-small" onClick={() => applyPreset("second")}>Вторая смена</button>
          <button className="btn btn-small" onClick={() => applyPreset("nowindows")}>Без окон</button>
        </div>

        <div className="filter-days">
          <span className="filter-label">День:</span>
          {DAY_NAMES.map((name, i) => (
            <button
              key={i}
              className={`btn btn-small${filters.days.includes(i) ? " btn-primary" : ""}`}
              onClick={() => toggleDay(i)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="filter-selects">
          <select value={filters.class_id} onChange={e => setFilters(f => ({ ...f, class_id: e.target.value }))}>
            <option value="">Все классы</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.subject_id} onChange={e => setFilters(f => ({ ...f, subject_id: e.target.value }))}>
            <option value="">Все предметы</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.teacher_id} onChange={e => setFilters(f => ({ ...f, teacher_id: e.target.value }))}>
            <option value="">Все учителя</option>
            {teachers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filters.room_id} onChange={e => setFilters(f => ({ ...f, room_id: e.target.value }))}>
            <option value="">Все кабинеты</option>
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filters.shift} onChange={e => setFilters(f => ({ ...f, shift: e.target.value as Shift | "" }))}>
            <option value="">Все смены</option>
            <option value="First">Первая</option>
            <option value="Second">Вторая</option>
          </select>
          <select value={filters.subgroup} onChange={e => setFilters(f => ({ ...f, subgroup: e.target.value }))}>
            <option value="">Все подгруппы</option>
            <option value="1гр">1 группа</option>
            <option value="2гр">2 группа</option>
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="filter-chips">
          {activeFilters.map(f => (
            <span key={f.key} className="filter-chip">
              {f.label}
              <button className="filter-chip-remove" onClick={f.onRemove}>×</button>
            </span>
          ))}
          <button className="btn btn-small" onClick={() => setFilters(INITIAL_FILTERS)}>Сбросить все</button>
        </div>
      )}

      <div className="filter-info">
        Показано: {filteredSlots.length} из {state.slots.length} слотов
      </div>

      <div className="timetable-grid" role="grid">
        <table className="table">
          <thead><tr><th>Слот</th>{DAY_NAMES.map(d => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: 7 }, (_, p) => (
              <tr key={p}><th>{p + 1} урок</th>{DAY_NAMES.map((_, d) => {
                const cell = filteredSlots.filter(s => s.day === d && s.period === p);
                return <td key={d}>{cell.map(c => <span key={c.id} className="chip" title={`${c.class_id} ${c.subject_id} ${c.teacher_id} ${c.room_id}`}>{c.subject_id}{c.subgroup_label ? `(${c.subgroup_label})` : ""}<br />{c.teacher_id.slice(0, 6)} · {c.room_id.slice(0, 6)}</span>).reduce((a, b) => <>{a}{b}</>, <></>)}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Подгруппы — диагональная ячейка (1гр/2гр) в один слот, разные учителя/кабинеты.</p>
    </div>
  );
}

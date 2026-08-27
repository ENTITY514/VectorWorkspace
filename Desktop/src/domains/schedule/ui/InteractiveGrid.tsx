import { memo, useMemo, useState, type DragEvent } from "react";
import type { ScheduleState, ScheduleSlot, ScheduleClass } from "../../../types";

export type GridMode = "class";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const PERIODS = [0, 1, 2, 3, 4, 5, 6];

const colorCache = new Map<string, string>();
function getColor(teacherId: string, subjectId: string): string {
  const key = `${teacherId}:${subjectId}`;
  let c = colorCache.get(key);
  if (!c) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    c = `hsl(${h % 360}, 65%, 65%)`;
    colorCache.set(key, c);
  }
  return c;
}

function shortenName(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const lastName = parts[0];
    const initials = parts.slice(1).map(p => p[0].toUpperCase() + ".").join("");
    return `${lastName} ${initials}`;
  }
  return fullName;
}

function getHumanRoomName(roomId: string, rooms: ScheduleState["rooms"]): string {
  const r = rooms.find(x => x.id === roomId);
  let name = r && r.name && !r.name.startsWith("r_") ? r.name : "";

  if (!name && roomId.startsWith("r_")) {
    const parts = roomId.split("_");
    if (parts.length >= 2) {
      const num = parts[1];
      const typeStr = parts[2] || "";
      if (typeStr === "gym") return "Спортзал";
      if (typeStr === "workshop") return `Мастерская ${num}`;
      if (typeStr === "informatics") return `Каб. ${num} (Информ.)`;
      if (typeStr === "chemistrylab") return `Каб. ${num} (Химия)`;
      if (typeStr === "biologylab") return `Каб. ${num} (Биол.)`;
      if (typeStr === "physicslab") return `Каб. ${num} (Физика)`;
      if (typeStr === "languagelab") return `Каб. ${num} (Язык)`;
      return `Каб. ${num}`;
    }
    name = roomId;
  }

  if (name.toLowerCase().includes("workshop")) {
    return name.replace(/workshop\s*(\d+)/i, "Мастерская $1").replace(/\(синт\.\)/i, "").trim();
  }
  return name || roomId;
}

function formatClassName(cls: ScheduleClass | undefined, classId: string): string {
  if (!cls) {
    if (classId.endsWith("_luo")) return classId.replace("_luo", "") + " ЛУО";
    if (classId.endsWith("_do")) return classId.replace("_do", "") + " ДО";
    return classId;
  }
  let base = cls.letter ? `${cls.grade}-${cls.letter}` : `${cls.grade}`;
  const ctype = (cls.class_type || "").toLowerCase();
  const idLower = (cls.id || "").toLowerCase();

  if (ctype === "luo" || idLower.endsWith("_luo") || idLower.includes("luo")) {
    base += " ЛУО";
  } else if (ctype === "do" || idLower.endsWith("_do") || idLower.includes("_do")) {
    base += " ДО";
  }
  return base;
}

interface InteractiveGridProps {
  state: ScheduleState;
  variantId: string | null;
  mode?: string;
  onModeChange?: (m: any) => void;
  onPin: (slot: ScheduleSlot) => void;
  onUnpin: (slotId: string) => void;
  onDragDrop: (slot: ScheduleSlot, day: number, period: number) => void;
}

interface CellData {
  colId: string;
  day: number;
  period: number;
  slots: ScheduleSlot[];
  pinned: boolean;
  isFull: boolean;
}

export interface SlotResolvedDetails {
  subjectName: string;
  teacherName: string;
  roomName: string;
  className: string;
  subgroupLabel: string | null;
  isJoint: boolean;
  color: string;
}

export function InteractiveGrid({ state, variantId, onPin, onUnpin, onDragDrop }: InteractiveGridProps) {
  const [dragSlot, setDragSlot] = useState<ScheduleSlot | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [teacherFilters, setTeacherFilters] = useState<string[]>([]);
  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [letterFilter, setLetterFilter] = useState("all");

  const fixedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const f of state.fixed_slots) {
      if (variantId && f.variant_id !== variantId) continue;
      s.add(`${f.class_id}:${f.day}:${f.period}`);
    }
    return s;
  }, [state.fixed_slots, variantId]);

  const uniqueLetters = useMemo(() => {
    const letters = new Set<string>();
    for (const c of state.classes) {
      if (c.letter && c.letter.trim()) {
        letters.add(c.letter.trim().toUpperCase());
      }
    }
    return Array.from(letters).sort();
  }, [state.classes]);

  const toggleTeacherFilter = (id: string) => {
    setTeacherFilters(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const resolveSlot = (slot: ScheduleSlot): SlotResolvedDetails => {
    const cls = state.classes.find(c => c.id === slot.class_id);
    const subj = state.subjects.find(s => s.id === slot.subject_id);
    const teacher = state.teachers.find(t => t.id === slot.teacher_id);

    return {
      subjectName: subj?.name || slot.subject_id,
      teacherName: teacher ? shortenName(teacher.full_name) : slot.teacher_id,
      roomName: getHumanRoomName(slot.room_id, state.rooms),
      className: formatClassName(cls, slot.class_id),
      subgroupLabel: slot.subgroup_label,
      isJoint: !!slot.joint_lesson_id,
      color: getColor(slot.teacher_id, slot.subject_id),
    };
  };

  const columns = useMemo(() => {
    const hasActiveSlotFilter = teacherFilters.length > 0 || !!subjectFilter || !!searchQuery.trim() || categoryFilter === "joint";

    return state.classes
      .filter(c => {
        const ctype = (c.class_type || "").toLowerCase();
        const idLower = (c.id || "").toLowerCase();
        const isLuo = ctype === "luo" || idLower.endsWith("_luo") || idLower.includes("luo");
        const isDo = ctype === "do" || idLower.endsWith("_do") || idLower.includes("_do");
        const isNormal = !isLuo && !isDo;

        if (categoryFilter === "normal" && !isNormal) return false;
        if (categoryFilter === "luo" && !isLuo) return false;
        if (categoryFilter === "do" && !isDo) return false;
        if (categoryFilter === "joint") {
          const hasJoint = state.slots.some(s => s.class_id === c.id && s.joint_lesson_id);
          if (!hasJoint) return false;
        }

        if (letterFilter !== "all") {
          const l = (c.letter || "").trim().toUpperCase();
          if (l !== letterFilter) return false;
        }

        // Hide columns with zero matching slots when teacher, subject, search, or joint filter is active
        if (hasActiveSlotFilter) {
          const hasMatchingSlot = state.slots.some(s => {
            if (s.class_id !== c.id) return false;
            if (teacherFilters.length > 0 && !teacherFilters.includes(s.teacher_id)) return false;
            if (subjectFilter && s.subject_id !== subjectFilter) return false;
            if (categoryFilter === "joint" && !s.joint_lesson_id) return false;

            if (searchQuery.trim()) {
              const q = searchQuery.trim().toLowerCase();
              const details = resolveSlot(s);
              const teacherObj = state.teachers.find(t => t.id === s.teacher_id);
              const matchesSearch =
                details.subjectName.toLowerCase().includes(q) ||
                details.teacherName.toLowerCase().includes(q) ||
                (teacherObj && teacherObj.full_name.toLowerCase().includes(q)) ||
                details.roomName.toLowerCase().includes(q) ||
                details.className.toLowerCase().includes(q) ||
                (details.subgroupLabel && details.subgroupLabel.toLowerCase().includes(q));
              if (!matchesSearch) return false;
            }

            return true;
          });

          if (!hasMatchingSlot) return false;
        }

        return true;
      })
      .map(c => ({ id: c.id, label: formatClassName(c, c.id) }));
  }, [state.classes, state.slots, state.teachers, state.rooms, state.subjects, categoryFilter, letterFilter, teacherFilters, subjectFilter, searchQuery]);

  const cellFor = (colId: string, day: number, period: number): CellData => {
    let slots = state.slots.filter(s => s.day === day && s.period === period && s.class_id === colId);

    if (teacherFilters.length > 0) {
      slots = slots.filter(s => teacherFilters.includes(s.teacher_id));
    }
    if (subjectFilter) {
      slots = slots.filter(s => s.subject_id === subjectFilter);
    }
    if (categoryFilter === "joint") {
      slots = slots.filter(s => !!s.joint_lesson_id);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      slots = slots.filter(s => {
        const details = resolveSlot(s);
        const teacherObj = state.teachers.find(t => t.id === s.teacher_id);
        return (
          details.subjectName.toLowerCase().includes(q) ||
          details.teacherName.toLowerCase().includes(q) ||
          (teacherObj && teacherObj.full_name.toLowerCase().includes(q)) ||
          details.roomName.toLowerCase().includes(q) ||
          details.className.toLowerCase().includes(q) ||
          (details.subgroupLabel && details.subgroupLabel.toLowerCase().includes(q))
        );
      });
    }

    const pinned = slots.length === 1 && fixedKeys.has(`${slots[0].class_id}:${slots[0].day}:${slots[0].period}`);
    return { colId, day, period, slots, pinned, isFull: slots.length > 0 };
  };

  const tooltipFor = (slot: ScheduleSlot): string => {
    const cls = state.classes.find(c => c.id === slot.class_id);
    const subj = state.subjects.find(s => s.id === slot.subject_id);
    const teacher = state.teachers.find(t => t.id === slot.teacher_id);
    return [
      `Класс: ${formatClassName(cls, slot.class_id)}`,
      `Предмет: ${subj?.name || slot.subject_id}`,
      `Учитель: ${teacher?.full_name || slot.teacher_id}`,
      `Кабинет: ${getHumanRoomName(slot.room_id, state.rooms)}`,
      slot.subgroup_label ? `Подгруппа: ${slot.subgroup_label}` : null,
      slot.joint_lesson_id ? "🔗 Совмещенный урок (Класс-комплект)" : null,
    ].filter(Boolean).join("\n");
  };

  const handleDrop = (e: DragEvent, day: number, period: number) => {
    e.preventDefault();
    setDragOver(null);
    if (dragSlot) onDragDrop(dragSlot, day, period);
    setDragSlot(null);
  };

  const hasActiveFilters = searchQuery || teacherFilters.length > 0 || subjectFilter || categoryFilter !== "all" || letterFilter !== "all";

  const resetFilters = () => {
    setSearchQuery("");
    setTeacherFilters([]);
    setIsTeacherDropdownOpen(false);
    setTeacherSearchQuery("");
    setSubjectFilter("");
    setCategoryFilter("all");
    setLetterFilter("all");
  };

  return (
    <div className="card">
      {/* Dynamic Multi-Filter Toolbar */}
      <div className="schedule-filter-toolbar">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Поиск (предмет, учитель, кабинет, класс)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        {/* Multi-Select Teacher Dropdown */}
        <div className="teacher-multiselect-container">
          <button
            type="button"
            className={`teacher-multiselect-btn ${teacherFilters.length > 0 ? "active" : ""}`}
            onClick={() => setIsTeacherDropdownOpen(!isTeacherDropdownOpen)}
          >
            👤 {teacherFilters.length === 0
              ? `Все учителя (${state.teachers.length})`
              : `Учителя: ${teacherFilters.length}`}
            <span style={{ fontSize: "10px", opacity: 0.7 }}>▼</span>
          </button>

          {isTeacherDropdownOpen && (
            <div className="teacher-dropdown-popover">
              <div className="teacher-dropdown-header">
                <div className="teacher-dropdown-actions">
                  <span onClick={() => setTeacherFilters(state.teachers.map(t => t.id))}>Выбрать всех</span>
                  <span onClick={() => setTeacherFilters([])}>Сбросить</span>
                </div>
                <button
                  className="clear-search-btn"
                  onClick={() => setIsTeacherDropdownOpen(false)}
                  style={{ position: "static", transform: "none" }}
                >
                  ✕
                </button>
              </div>

              <input
                type="text"
                className="teacher-dropdown-search"
                placeholder="Поиск учителя..."
                value={teacherSearchQuery}
                onChange={e => setTeacherSearchQuery(e.target.value)}
              />

              <div className="teacher-list-scroll">
                {state.teachers
                  .filter(t => t.full_name.toLowerCase().includes(teacherSearchQuery.toLowerCase()))
                  .map(t => {
                    const checked = teacherFilters.includes(t.id);
                    return (
                      <label key={t.id} className="teacher-checkbox-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTeacherFilter(t.id)}
                        />
                        <span>{t.full_name}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <select className="filter-select" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="">📚 Все предметы ({state.subjects.length})</option>
          {state.subjects.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select className="filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">🏫 Все типы классов</option>
          <option value="normal">Стандартные классы</option>
          <option value="luo">ЛУО (Спецклассы)</option>
          <option value="do">ДО (Домашнее обучение)</option>
          <option value="joint">🔗 Только Класс-комплекты</option>
        </select>

        <select className="filter-select" value={letterFilter} onChange={e => setLetterFilter(e.target.value)}>
          <option value="all">🔤 Все литеры</option>
          {uniqueLetters.map(l => (
            <option key={l} value={l}>
              Литера {l}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button className="btn btn-small btn-secondary" onClick={resetFilters} title="Сбросить все фильтры">
            ✕ Сбросить
          </button>
        )}
      </div>

      {columns.length === 0 ? (
        <div className="empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
          <p className="muted">Нет классов, соответствующих выбранным фильтрам.</p>
          {hasActiveFilters && (
            <button className="btn btn-small btn-primary" style={{ marginTop: 8 }} onClick={resetFilters}>
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="timetable-grid" role="grid">
          <table className="table interactive-grid">
            <thead>
              <tr>
                <th colSpan={2} className="corner-col">
                  День / Урок
                </th>
                {columns.map(c => <th key={c.id}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((_, d) => (
                PERIODS.map(p => (
                  <tr key={`${d}:${p}`}>
                    {p === 0 && <th rowSpan={7}>{DAY_NAMES[d]}</th>}
                    <th className="period-col">{p + 1}</th>
                    {columns.map(c => {
                      const cell = cellFor(c.id, d, p);
                      return (
                        <GridCellMemo
                          key={`${c.id}:${d}:${p}`}
                          cell={cell}
                          resolveSlot={resolveSlot}
                          tooltipFor={tooltipFor}
                          dragSlotId={dragSlot?.id ?? null}
                          dragOverKey={dragOver}
                          onSlotClick={(slot) => (fixedKeys.has(`${slot.class_id}:${slot.day}:${slot.period}`) ? onUnpin(slot.id) : onPin(slot))}
                          onDragStart={(slot) => setDragSlot(slot)}
                          onDragEnd={() => { setDragSlot(null); setDragOver(null); }}
                          onDragOverKey={(key) => setDragOver(key)}
                          onDrop={(e, day, period) => handleDrop(e, day, period)}
                        />
                      );
                    })}
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ marginTop: 8 }}>
        Клик по карточке урока — закрепить/открепить. Перетаскивание — переместить на другой день/урок. Иконка 🔗 указывает на совмещенный урок (класс-комплект).
      </p>
    </div>
  );
}

interface GridCellProps {
  cell: CellData;
  resolveSlot: (slot: ScheduleSlot) => SlotResolvedDetails;
  tooltipFor: (slot: ScheduleSlot) => string;
  dragSlotId: string | null;
  dragOverKey: string | null;
  onSlotClick: (slot: ScheduleSlot) => void;
  onDragStart: (slot: ScheduleSlot) => void;
  onDragEnd: () => void;
  onDragOverKey: (key: string | null) => void;
  onDrop: (e: DragEvent, day: number, period: number) => void;
}

function GridCell({ cell, resolveSlot, tooltipFor, dragSlotId, dragOverKey, onSlotClick, onDragStart, onDragEnd, onDragOverKey, onDrop }: GridCellProps) {
  const cellKey = `${cell.colId}:${cell.day}:${cell.period}`;
  const isOver = dragOverKey === cellKey && dragSlotId !== null;
  return (
    <td
      className={`grid-cell${cell.isFull ? " has-slot" : ""}${cell.pinned ? " pinned" : ""}${isOver ? " drag-over" : ""}`}
      onDragOver={e => { e.preventDefault(); if (dragSlotId) onDragOverKey(cellKey); }}
      onDragLeave={() => { if (dragOverKey === cellKey) onDragOverKey(null); }}
      onDrop={e => onDrop(e, cell.day, cell.period)}
    >
      {cell.slots.map(slot => {
        const isDrag = dragSlotId === slot.id;
        const details = resolveSlot(slot);
        return (
          <div
            key={slot.id}
            draggable
            className={`schedule-card${isDrag ? " dragging" : ""}${cell.pinned ? " pinned-card" : ""}`}
            style={{ borderLeftColor: details.color }}
            title={tooltipFor(slot)}
            onClick={e => { e.stopPropagation(); onSlotClick(slot); }}
            onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(slot); }}
            onDragEnd={onDragEnd}
          >
            <div className="schedule-card-top">
              <span className="schedule-card-title">{details.subjectName}</span>
              <div className="schedule-card-badges">
                {details.subgroupLabel ? <span className="card-badge badge-subgroup">гр.{details.subgroupLabel}</span> : null}
                {details.isJoint ? <span className="card-badge badge-joint" title="Класс-комплект">🔗</span> : null}
                {cell.pinned ? <span className="card-badge badge-pin" title="Закреплён">📌</span> : null}
              </div>
            </div>

            <div className="schedule-card-meta">
              {details.teacherName && <span className="meta-item meta-teacher">👤 {details.teacherName}</span>}
              {details.roomName && <span className="meta-item meta-room">🚪 {details.roomName}</span>}
            </div>
          </div>
        );
      })}
    </td>
  );
}

const GridCellMemo = memo(GridCell);
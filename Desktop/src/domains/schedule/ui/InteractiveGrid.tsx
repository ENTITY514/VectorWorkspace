import { memo, useMemo, useState, type DragEvent } from "react";
import type { ScheduleState, ScheduleSlot } from "../../../types";

export type GridMode = "class" | "teacher" | "room";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const PERIODS = [0, 1, 2, 3, 4, 5, 6];

const colorCache = new Map<string, string>();
function getColor(teacherId: string, subjectId: string): string {
  const key = `${teacherId}:${subjectId}`;
  let c = colorCache.get(key);
  if (!c) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    c = `hsl(${h % 360}, 45%, 85%)`;
    colorCache.set(key, c);
  }
  return c;
}

interface InteractiveGridProps {
  state: ScheduleState;
  variantId: string | null;
  mode: GridMode;
  onModeChange: (m: GridMode) => void;
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

export function InteractiveGrid({ state, variantId, mode, onModeChange, onPin, onUnpin, onDragDrop }: InteractiveGridProps) {
  const [dragSlot, setDragSlot] = useState<ScheduleSlot | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const fixedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const f of state.fixed_slots) {
      if (variantId && f.variant_id !== variantId) continue;
      s.add(`${f.class_id}:${f.day}:${f.period}`);
    }
    return s;
  }, [state.fixed_slots, variantId]);

  const columns = useMemo(() => {
    if (mode === "class") return state.classes.map(c => ({ id: c.id, label: `${c.grade}${c.letter}` }));
    if (mode === "teacher") return state.teachers.map(t => ({ id: t.id, label: t.full_name }));
    return state.rooms.map(r => ({ id: r.id, label: r.name }));
  }, [mode, state.classes, state.teachers, state.rooms]);

  const matchesCol = (slot: ScheduleSlot, colId: string): boolean => {
    if (mode === "class") return slot.class_id === colId;
    if (mode === "teacher") return slot.teacher_id === colId;
    return slot.room_id === colId;
  };

  const cellFor = (colId: string, day: number, period: number): CellData => {
    const slots = state.slots.filter(s => s.day === day && s.period === period && matchesCol(s, colId));
    const pinned = slots.length === 1 && fixedKeys.has(`${slots[0].class_id}:${slots[0].day}:${slots[0].period}`);
    return { colId, day, period, slots, pinned, isFull: slots.length > 0 };
  };

  const labelFor = (slot: ScheduleSlot): string => {
    if (mode === "class") return state.subjects.find(s => s.id === slot.subject_id)?.name || slot.subject_id;
    if (mode === "teacher") {
      const cls = state.classes.find(c => c.id === slot.class_id);
      const subj = state.subjects.find(s => s.id === slot.subject_id);
      return `${cls ? cls.grade + cls.letter : slot.class_id} · ${subj?.name || slot.subject_id}`;
    }
    return state.subjects.find(s => s.id === slot.subject_id)?.name || slot.subject_id;
  };

  const tooltipFor = (slot: ScheduleSlot): string => {
    const cls = state.classes.find(c => c.id === slot.class_id);
    const subj = state.subjects.find(s => s.id === slot.subject_id);
    const teacher = state.teachers.find(t => t.id === slot.teacher_id);
    const room = state.rooms.find(r => r.id === slot.room_id);
    return [
      `Класс: ${cls ? cls.grade + cls.letter : slot.class_id}`,
      `Предмет: ${subj?.name || slot.subject_id}`,
      `Учитель: ${teacher?.full_name || slot.teacher_id}`,
      `Кабинет: ${room?.name || slot.room_id}`,
      slot.subgroup_label ? `Подгруппа: ${slot.subgroup_label}` : null,
    ].filter(Boolean).join("\n");
  };

  const handleDrop = (e: DragEvent, day: number, period: number) => {
    e.preventDefault();
    setDragOver(null);
    if (dragSlot) onDragDrop(dragSlot, day, period);
    setDragSlot(null);
  };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <span className="filter-label">Режим:</span>
        {(["class", "teacher", "room"] as GridMode[]).map(m => (
          <button key={m} className={`btn btn-small${mode === m ? " btn-primary" : ""}`} onClick={() => onModeChange(m)}>
            {{ class: "Классы", teacher: "Учителя", room: "Кабинеты" }[m]}
          </button>
        ))}
      </div>

      {columns.length === 0 ? (
        <p className="muted">Нет данных для отображения.</p>
      ) : (
        <div className="timetable-grid" role="grid">
          <table className="table interactive-grid">
            <thead>
              <tr>
                <th>Слот</th>
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
                          colorFor={getColor}
                          labelFor={labelFor}
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
      <p className="muted">Клик по уроку — закрепить (закрепить закреплённый — открепить). Перетаскивание урока — переместить на другой день/урок.</p>
    </div>
  );
}

interface GridCellProps {
  cell: CellData;
  colorFor: (teacherId: string, subjectId: string) => string;
  labelFor: (slot: ScheduleSlot) => string;
  tooltipFor: (slot: ScheduleSlot) => string;
  dragSlotId: string | null;
  dragOverKey: string | null;
  onSlotClick: (slot: ScheduleSlot) => void;
  onDragStart: (slot: ScheduleSlot) => void;
  onDragEnd: () => void;
  onDragOverKey: (key: string | null) => void;
  onDrop: (e: DragEvent, day: number, period: number) => void;
}

function GridCell({ cell, colorFor, labelFor, tooltipFor, dragSlotId, dragOverKey, onSlotClick, onDragStart, onDragEnd, onDragOverKey, onDrop }: GridCellProps) {
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
        return (
          <span
            key={slot.id}
            draggable
            className={`chip${isDrag ? " dragging" : ""}${cell.pinned ? " pinned-chip" : ""}`}
            style={{ background: colorFor(slot.teacher_id, slot.subject_id) }}
            title={tooltipFor(slot)}
            onClick={e => { e.stopPropagation(); onSlotClick(slot); }}
            onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(slot); }}
            onDragEnd={onDragEnd}
          >
            {labelFor(slot)}
            {cell.pinned ? <span className="pin-marker">📌</span> : null}
          </span>
        );
      })}
    </td>
  );
}

const GridCellMemo = memo(GridCell);
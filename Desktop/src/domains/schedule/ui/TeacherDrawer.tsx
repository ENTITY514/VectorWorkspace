import { useMemo, useState, Fragment } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { showToast } from "../../../components/Toast";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

function parseAvailability(json: string): boolean[][] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length === 6 && parsed[0].length === 8) return parsed;
  } catch {}
  return Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => true));
}

function availabilityToJson(matrix: boolean[][]): string {
  return JSON.stringify(matrix);
}

interface TeacherDrawerProps {
  teacher: ScheduleState["teachers"][0];
  rooms: ScheduleState["rooms"];
  subjects: ScheduleState["subjects"];
  classes: ScheduleState["classes"];
  curriculum: ScheduleState["curriculum"];
  onSave: () => void;
  onClose: () => void;
}

export function TeacherDrawer({ teacher, rooms, subjects, classes, curriculum, onSave, onClose }: TeacherDrawerProps) {
  const [editRoom, setEditRoom] = useState(teacher.base_room_id || "");
  const [editMax, setEditMax] = useState(teacher.max_daily_lessons);
  const [editAvail, setEditAvail] = useState<boolean[][]>(() => parseAvailability(teacher.availability_json));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const teacherCurriculum = useMemo(() =>
    curriculum.filter(c => c.teacher_id === teacher.id),
    [curriculum, teacher.id]
  );

  const toggleAvail = (day: number, period: number) => {
    setEditAvail(prev => {
      const next = prev.map(row => [...row]);
      next[day][period] = !next[day][period];
      return next;
    });
  };

  const setAll = (value: boolean) =>
    setEditAvail(prev => prev.map(row => row.map(() => value)));

  const clearPeriod = (period: number) =>
    setEditAvail(prev => prev.map(row => {
      const next = [...row];
      next[period] = false;
      return next;
    }));

  const clearDay = (day: number) =>
    setEditAvail(prev => {
      const next = prev.map(row => [...row]);
      next[day] = next[day].map(() => false);
      return next;
    });

  const save = async () => {
    const hasAnyTrue = editAvail.some(row => row.some(v => v));
    if (!hasAnyTrue) { setErrors({ avail: "Хотя бы один слот должен быть доступен" }); return; }
    await scheduleApi.upsertTeacher({
      id: teacher.id,
      full_name: teacher.full_name,
      base_room_id: editRoom || null,
      max_daily_lessons: editMax,
      availability_json: availabilityToJson(editAvail),
    });
    setErrors({});
    onSave();
    showToast("Учитель обновлён", "success");
  };

  const subjectName = (id: string) => subjects.find(s => s.id === id)?.name || id;
  const className = (id: string) => {
    const c = classes.find(c => c.id === id);
    return c ? `${c.grade}${c.letter}` : id;
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>{teacher.full_name}</h3>
          <button className="btn btn-small" onClick={onClose}>✕</button>
        </div>

        {/* Room selector */}
        <div className="drawer-section">
          <label className="form-label">Базовый кабинет</label>
          <select className="filter-select" value={editRoom} onChange={e => setEditRoom(e.target.value)}>
            <option value="">— нет —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {/* Max daily lessons */}
        <div className="drawer-section">
          <label className="form-label">Макс. уроков/день</label>
          <input type="number" className="search-input" value={editMax} onChange={e => setEditMax(Number(e.target.value))} style={{ width: 80 }} />
        </div>

        {/* Availability matrix */}
        <div className="drawer-section">
          <div className="matrix-head">
            <h4>Доступность</h4>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-small" onClick={() => setAll(true)}>Все</button>
              <button type="button" className="btn btn-small" onClick={() => setAll(false)}>Очистить</button>
            </div>
          </div>
          <div className="availability-grid">
            <div className="header"></div>
            {PERIODS.map((p, idx) => (
              <div key={p} className="header matrix-period-head">
                <span>{p}</span>
                <button type="button" className="matrix-clear" title={`Очистить урок ${p}`} onClick={() => clearPeriod(idx)}>×</button>
              </div>
            ))}
            {DAYS.map((day, d) => (
              <Fragment key={d}>
                <div className="day-label matrix-day-head">
                  <span>{day}</span>
                  <button type="button" className="matrix-clear" title={`Очистить ${day}`} onClick={() => clearDay(d)}>×</button>
                </div>
                {PERIODS.map((_, p) => (
                  <div key={p} className="cell">
                    <input type="checkbox" checked={editAvail[d]?.[p] ?? true} onChange={() => toggleAvail(d, p)} />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          {errors.avail && <p className="field-error">{errors.avail}</p>}
        </div>

        {/* Curriculum / load table */}
        <div className="drawer-section">
          <h4>Нагрузка ({teacherCurriculum.length} записей)</h4>
          {teacherCurriculum.length === 0 ? (
            <p className="muted">Нет назначенных уроков</p>
          ) : (
            <table className="table centered" style={{ fontSize: 13 }}>
              <thead><tr><th>Класс</th><th>Предмет</th><th>Часов/нед</th></tr></thead>
              <tbody>
                {teacherCurriculum.map((c, i) => (
                  <tr key={i}>
                    <td>{className(c.class_id)}</td>
                    <td>{subjectName(c.subject_id)}</td>
                    <td>{c.hours_per_week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="drawer-footer">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

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
    if (!c) {
      if (id.endsWith("_luo")) return id.replace("_luo", "") + " ЛУО";
      if (id.endsWith("_do")) return id.replace("_do", "") + " ДО";
      return id;
    }
    let base = c.letter ? `${c.grade}-${c.letter}` : `${c.grade}`;
    const ctype = (c.class_type || "").toLowerCase();
    const idLower = (c.id || "").toLowerCase();
    if (ctype === "luo" || idLower.endsWith("_luo") || idLower.includes("luo")) base += " ЛУО";
    else if (ctype === "do" || idLower.endsWith("_do") || idLower.includes("_do")) base += " ДО";
    return base;
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const physicalSlotsCount = useMemo(() => {
    let total = 0;
    const jointGroups = new Map<string, number>();
    for (const c of teacherCurriculum) {
      if (c.joint_lesson_id) {
        const curMax = jointGroups.get(c.joint_lesson_id) || 0;
        jointGroups.set(c.joint_lesson_id, Math.max(curMax, c.hours_per_week));
      } else {
        total += c.hours_per_week;
      }
    }
    for (const hrs of jointGroups.values()) total += hrs;
    return total;
  }, [teacherCurriculum]);

  const handleCombineSelected = async () => {
    if (selectedIds.length < 2) return;
    const jid = `jl_${teacher.id}_${Date.now().toString(36)}`;
    await scheduleApi.toggleJointLessons(selectedIds, jid);
    setSelectedIds([]);
    onSave();
    showToast("Уроки успешно объединены в класс-комплект", "success");
  };

  const handleUnlink = async (id: string) => {
    await scheduleApi.toggleJointLessons([id], null);
    onSave();
    showToast("Связь совмещения удалена", "info");
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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h4>
              Нагрузка ({teacherCurriculum.length} записей · <strong style={{ color: physicalSlotsCount > 35 ? "#ef4444" : "#10b981" }}>{physicalSlotsCount} физич. слотов</strong>)
            </h4>
            {selectedIds.length >= 2 && (
              <button className="btn btn-small btn-primary" onClick={handleCombineSelected}>
                🔗 Совместить ({selectedIds.length})
              </button>
            )}
          </div>

          {teacherCurriculum.length === 0 ? (
            <p className="muted">Нет назначенных уроков</p>
          ) : (
            <table className="table centered" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Класс</th>
                  <th>Предмет</th>
                  <th>Часов</th>
                  <th>Совмещение</th>
                </tr>
              </thead>
              <tbody>
                {teacherCurriculum.map((c) => {
                  const isChecked = selectedIds.includes(c.id);
                  return (
                    <tr key={c.id} style={{ background: c.joint_lesson_id ? "rgba(59, 130, 246, 0.18)" : undefined }}>
                      <td>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(c.id)} />
                      </td>
                      <td>{className(c.class_id)}</td>
                      <td>{subjectName(c.subject_id)}</td>
                      <td>{c.hours_per_week}</td>
                      <td>
                        {c.joint_lesson_id ? (
                          <div className="row" style={{ gap: 4, justifyContent: "center" }}>
                            <span className="badge badge-green">🔗 Комплект</span>
                            <button className="btn btn-small" style={{ padding: "1px 6px" }} title="Разъединить" onClick={() => handleUnlink(c.id)}>
                              ✂️
                            </button>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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

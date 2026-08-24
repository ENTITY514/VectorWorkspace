import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { showToast } from "../../../components/Toast";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

function parseAvailability(json: string): boolean[][] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length === 6 && parsed[0].length === 8) {
      return parsed;
    }
  } catch {}
  return Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => true));
}

function availabilityToJson(matrix: boolean[][]): string {
  return JSON.stringify(matrix);
}

export function TeachersTab() {
  const [list, setList] = useState<ScheduleState["teachers"]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMax, setEditMax] = useState(0);
  const [editAvail, setEditAvail] = useState<boolean[][]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => setList((await scheduleApi.getState()).teachers);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "ФИО обязателен";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    const avail = availabilityToJson(Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => true)));
    await scheduleApi.upsertTeacher({ full_name: name, max_daily_lessons: 0, availability_json: avail });
    setName(""); setErrors({}); load();
    showToast("Учитель добавлен", "success");
  };

  const startEdit = (t: ScheduleState["teachers"][0]) => {
    setEditingId(t.id);
    setEditName(t.full_name);
    setEditMax(t.max_daily_lessons);
    setEditAvail(parseAvailability(t.availability_json));
    setErrors({});
  };

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (!editName.trim()) newErrors.editName = "ФИО обязателен";
    if (editMax < 0 || editMax > 10) newErrors.editMax = "Макс. 0..10";
    // Check at least one true in availability
    const hasAnyTrue = editAvail.some(row => row.some(v => v));
    if (!hasAnyTrue) newErrors.editAvail = "Хотя бы один слот должен быть доступен";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    await scheduleApi.upsertTeacher({
      id,
      full_name: editName,
      max_daily_lessons: editMax,
      availability_json: availabilityToJson(editAvail),
    });
    setEditingId(null); setErrors({}); load();
    showToast("Учитель обновлён", "success");
  };

  const deleteTeacher = (id: string, label: string) => {
    if (window.confirm(`Удалить учителя «${label}»?`)) {
      scheduleApi.deleteTeacher(id).then(() => {
        load();
        showToast("Учитель удалён", "success");
      });
    }
  };

  const toggleAvail = (day: number, period: number) => {
    setEditAvail(prev => {
      const next = prev.map(row => [...row]);
      next[day][period] = !next[day][period];
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(t => t.full_name.toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="card">
      <h3>Учителя · матрица доступности 6×8</h3>
      <div className="row">
        <input placeholder="ФИО" value={name} onChange={e => { setName(e.target.value); setErrors({}); }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по ФИО..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>
        {filtered.map(t => (
          <li key={t.id}>
            {editingId === t.id ? (
              <div className="inline-edit-form">
                <div className="row">
                  <input value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} style={{ minWidth: 150 }} />
                  <label>Макс. ур./день: <input type="number" value={editMax} onChange={e => setEditMax(Number(e.target.value))} style={{ width: 60 }} /></label>
                  <button className="btn btn-small btn-primary" onClick={() => saveEdit(t.id)}>Сохранить</button>
                  <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
                </div>
                {errors.editName && <p className="field-error">{errors.editName}</p>}
                {errors.editMax && <p className="field-error">{errors.editMax}</p>}
                {errors.editAvail && <p className="field-error">{errors.editAvail}</p>}

                <div className="availability-matrix">
                  <h4>Матрица доступности (отметьте доступные слоты)</h4>
                  <div className="availability-grid">
                    <div className="header"></div>
                    {PERIODS.map(p => <div key={p} className="header">{p}</div>)}
                    {DAYS.map((day, d) => (
                      <React.Fragment key={d}>
                        <div className="day-label">{day}</div>
                        {PERIODS.map((_, p) => (
                          <div key={p} className="cell">
                            <input
                              type="checkbox"
                              checked={editAvail[d]?.[p] ?? true}
                              onChange={() => toggleAvail(d, p)}
                            />
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <span className="clickable" onClick={() => startEdit(t)}>{t.full_name} · макс. {t.max_daily_lessons} ур./день</span>
                <button className="btn btn-small" onClick={() => deleteTeacher(t.id, t.full_name)}>Удалить</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="muted">Нажмите на учителя для редактирования. Матрица доступности — 6×8 чекбоксов.</p>
    </div>
  );
}

// Need to import React for React.Fragment
import React from "react";

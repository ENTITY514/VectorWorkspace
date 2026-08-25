import { useEffect, useMemo, useState, Fragment } from "react";
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

function availCount(json: string): number {
  const m = parseAvailability(json);
  return m.reduce((acc, row) => acc + row.filter(Boolean).length, 0);
}

export function TeachersTab() {
  const [list, setList] = useState<ScheduleState["teachers"]>([]);
  const [rooms, setRooms] = useState<ScheduleState["rooms"]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [filterRoom, setFilterRoom] = useState("all");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // modal (settings) state
  const [modalTeacher, setModalTeacher] = useState<ScheduleState["teachers"][0] | null>(null);
  const [editName, setEditName] = useState("");
  const [editMax, setEditMax] = useState(0);
  const [editRoom, setEditRoom] = useState("");
  const [editAvail, setEditAvail] = useState<boolean[][]>([]);

  const load = async () => {
    const data = await scheduleApi.getState();
    setList(data.teachers);
    setRooms(data.rooms);
  };
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

  const openModal = (t: ScheduleState["teachers"][0]) => {
    setModalTeacher(t);
    setEditName(t.full_name);
    setEditMax(t.max_daily_lessons);
    setEditRoom(t.base_room_id || "");
    setEditAvail(parseAvailability(t.availability_json));
    setErrors({});
  };

  const closeModal = () => setModalTeacher(null);

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (!editName.trim()) newErrors.editName = "ФИО обязателен";
    if (editMax < 0 || editMax > 10) newErrors.editMax = "Макс. 0..10";
    const hasAnyTrue = editAvail.some(row => row.some(v => v));
    if (!hasAnyTrue) newErrors.editAvail = "Хотя бы один слот должен быть доступен";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    await scheduleApi.upsertTeacher({
      id,
      full_name: editName,
      base_room_id: editRoom || null,
      max_daily_lessons: editMax,
      availability_json: availabilityToJson(editAvail),
    });
    setErrors({}); closeModal(); load();
    showToast("Учитель обновлён", "success");
  };

  const deleteTeacher = (id: string, label: string) => {
    if (window.confirm(`Удалить учителя «${label}»?`)) {
      scheduleApi.deleteTeacher(id).then(() => {
        setModalTeacher(null);
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

  const roomName = (id?: string | null) => rooms.find(r => r.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(t => {
      if (filterRoom !== "all" && (t.base_room_id || "") !== filterRoom) return false;
      if (q && !t.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, search, filterRoom]);

  return (
    <div className="card">
      <h3>Учителя · матрица доступности 6×8</h3>
      <div className="row">
        <input placeholder="ФИО" value={name} onChange={e => { setName(e.target.value); setErrors({}); }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}

      {list.length > 0 && (
        <div className="filter-selects">
          <select className="filter-select" value={filterRoom} onChange={e => setFilterRoom(e.target.value)}>
            <option value="all">Все кабинеты</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="search-input" placeholder="Поиск по ФИО..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted">Нет учителей по выбранному фильтру.</p>
      ) : (
        <table className="table centered">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Кабинет</th>
              <th>Макс. ур./день</th>
              <th>Доступность</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="clickable" onClick={() => openModal(t)}>
                <td className="cell-main">{t.full_name}</td>
                <td>{roomName(t.base_room_id)}</td>
                <td>{t.max_daily_lessons}</td>
                <td>{availCount(t.availability_json)}/48</td>
                <td>
                  <button
                    className="btn btn-small"
                    onClick={(e) => { e.stopPropagation(); deleteTeacher(t.id, t.full_name); }}
                  >Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalTeacher && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal teacher-modal" onClick={e => e.stopPropagation()}>
            <h3>Настройки учителя · {editName || ""}</h3>
            <div className="form-grid">
              <div className="form-row">
                <div className="form-field" style={{ minWidth: 220 }}>
                  <label className="form-label">ФИО</label>
                  <input className="search-input" value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} />
                </div>
                <div className="form-field">
                  <label className="form-label">Макс. ур./день</label>
                  <input type="number" className="search-input" value={editMax} onChange={e => { setEditMax(Number(e.target.value)); setErrors({}); }} />
                </div>
                <div className="form-field">
                  <label className="form-label">Базовый кабинет</label>
                  <select className="filter-select" value={editRoom} onChange={e => setEditRoom(e.target.value)}>
                    <option value="">— нет —</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="availability-matrix">
              <div className="matrix-head">
                <h4>Матрица доступности (отметьте доступные слоты)</h4>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-small" onClick={() => setAll(true)}>Выделить всё</button>
                  <button type="button" className="btn btn-small" onClick={() => setAll(false)}>Очистить всё</button>
                </div>
              </div>
              <div className="availability-grid">
                <div className="header"></div>
                {PERIODS.map((p, idx) => (
                  <div key={p} className="header matrix-period-head">
                    <span>{p}</span>
                    <button
                      type="button"
                      className="matrix-clear"
                      title={`Очистить урок ${p}`}
                      onClick={() => clearPeriod(idx)}
                    >×</button>
                  </div>
                ))}
                {DAYS.map((day, d) => (
                  <Fragment key={d}>
                    <div className="day-label matrix-day-head">
                      <span>{day}</span>
                      <button
                        type="button"
                        className="matrix-clear"
                        title={`Очистить ${day}`}
                        onClick={() => clearDay(d)}
                      >×</button>
                    </div>
                    {PERIODS.map((_, p) => (
                      <div key={p} className="cell">
                        <input
                          type="checkbox"
                          checked={editAvail[d]?.[p] ?? true}
                          onChange={() => toggleAvail(d, p)}
                        />
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>

            {errors.editName && <p className="field-error">{errors.editName}</p>}
            {errors.editMax && <p className="field-error">{errors.editMax}</p>}
            {errors.editAvail && <p className="field-error">{errors.editAvail}</p>}
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-small" onClick={() => deleteTeacher(modalTeacher.id, editName)}>Удалить</button>
              <button className="btn" onClick={closeModal}>Отмена</button>
              <button className="btn btn-primary" onClick={() => saveEdit(modalTeacher.id)}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

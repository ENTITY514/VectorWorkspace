import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { showToast } from "../../../components/Toast";

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

function availCount(json: string): number {
  const m = parseAvailability(json);
  return m.reduce((acc, row) => acc + row.filter(Boolean).length, 0);
}

interface TeachersTabProps {
  onSelectTeacher?: (teacher: ScheduleState["teachers"][0]) => void;
}

export function TeachersTab({ onSelectTeacher }: TeachersTabProps) {
  const [list, setList] = useState<ScheduleState["teachers"]>([]);
  const [rooms, setRooms] = useState<ScheduleState["rooms"]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [filterRoom, setFilterRoom] = useState("all");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => {
    const data = await scheduleApi.getState();
    setList(data.teachers);
    setRooms(data.rooms);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) { setErrors({ name: "ФИО обязателен" }); return; }
    const avail = availabilityToJson(Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => true)));
    await scheduleApi.upsertTeacher({ full_name: name, max_daily_lessons: 0, availability_json: avail });
    setName(""); setErrors({}); load();
    showToast("Учитель добавлен", "success");
  };

  const deleteTeacher = (id: string, label: string) => {
    if (window.confirm(`Удалить учителя «${label}»?`)) {
      scheduleApi.deleteTeacher(id).then(() => { load(); showToast("Учитель удалён", "success"); });
    }
  };

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
              <tr key={t.id} className="clickable" onClick={() => onSelectTeacher?.(t)}>
                <td className="cell-main">{t.full_name}</td>
                <td>{roomName(t.base_room_id)}</td>
                <td>{t.max_daily_lessons}</td>
                <td>{availCount(t.availability_json)}/48</td>
                <td>
                  <button className="btn btn-small" onClick={e => { e.stopPropagation(); deleteTeacher(t.id, t.full_name); }}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

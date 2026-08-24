import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState, RoomType } from "../../../types";
import { ROOM_TYPE_LABELS } from "../../../types";

export function RoomsTab() {
  const [list, setList] = useState<ScheduleState["rooms"]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<RoomType>("General");
  const [editCapacity, setEditCapacity] = useState(30);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => setList((await scheduleApi.getState()).rooms);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Название обязательно";
    if (list.some(r => r.name === name.trim())) newErrors.name = "Название уже существует";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertRoom({ name, room_type: "General", capacity: 30 });
    setName(""); setErrors({}); load();
  };

  const startEdit = (r: ScheduleState["rooms"][0]) => {
    setEditingId(r.id);
    setEditName(r.name);
    setEditType(r.room_type);
    setEditCapacity(r.capacity);
    setErrors({});
  };

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (!editName.trim()) newErrors.editName = "Название обязательно";
    if (list.some(r => r.name === editName.trim() && r.id !== id)) newErrors.editName = "Название уже существует";
    if (editCapacity < 1 || editCapacity > 200) newErrors.editCapacity = "Вместимость 1..200";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertRoom({ id, name: editName, room_type: editType, capacity: editCapacity });
    setEditingId(null); setErrors({}); load();
  };

  const deleteRoom = (id: string, label: string) => {
    if (window.confirm(`Удалить кабинет «${label}»?`)) {
      scheduleApi.deleteRoom(id).then(load);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(r => r.name.toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="card">
      <h3>Кабинеты · тип / вместимость / этаж</h3>
      <div className="row">
        <input placeholder="Название" value={name} onChange={e => { setName(e.target.value); setErrors({}); }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>
        {filtered.map(r => (
          <li key={r.id}>
            {editingId === r.id ? (
              <>
                <input value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} style={{ minWidth: 120 }} />
                <select value={editType} onChange={e => setEditType(e.target.value as RoomType)}>
                  {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="number" value={editCapacity} onChange={e => setEditCapacity(Number(e.target.value))} style={{ width: 60 }} />
                <button className="btn btn-small btn-primary" onClick={() => saveEdit(r.id)}>Сохранить</button>
                <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
              </>
            ) : (
              <>
                <span className="clickable" onClick={() => startEdit(r)}>{r.name} · {ROOM_TYPE_LABELS[r.room_type]} · {r.capacity}</span>
                <button className="btn btn-small" onClick={() => deleteRoom(r.id, r.name)}>Удалить</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

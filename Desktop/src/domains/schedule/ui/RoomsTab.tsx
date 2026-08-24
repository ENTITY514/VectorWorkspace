import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { ROOM_TYPE_LABELS } from "../../../types";

export function RoomsTab() {
  const [list, setList] = useState<ScheduleState["rooms"]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const load = async () => setList((await scheduleApi.getState()).rooms);
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!name.trim()) return;
    await scheduleApi.upsertRoom({ name, room_type: "General", capacity: 30 });
    setName(""); load();
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
        <input placeholder="Название" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>{filtered.map(r => <li key={r.id}>{r.name} · {ROOM_TYPE_LABELS[r.room_type]} · {r.capacity} <button className="btn btn-small" onClick={() => scheduleApi.deleteRoom(r.id).then(load)}>Удалить</button></li>)}</ul>
    </div>
  );
}

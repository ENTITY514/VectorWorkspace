import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { ROOM_TYPE_LABELS } from "../../../types";

export function RoomsTab() {
  const [list, setList] = useState<ScheduleState["rooms"]>([]);
  const [name, setName] = useState("");
  const load = async ()=> setList((await scheduleApi.getState()).rooms);
  useEffect(()=>{ load(); },[]);
  const add = async ()=>{
    if (!name.trim()) return;
    await scheduleApi.upsertRoom({ name, room_type: "General", capacity: 30 });
    setName(""); load();
  };
  return (
    <div className="card">
      <h3>Кабинеты · тип / вместимость / этаж</h3>
      <div className="row">
        <input placeholder="Название" value={name} onChange={e=>setName(e.target.value)} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      <ul>{list.map(r=> <li key={r.id}>{r.name} · {ROOM_TYPE_LABELS[r.room_type]} · {r.capacity} <button className="btn btn-small" onClick={()=>scheduleApi.deleteRoom(r.id).then(load)}>Удалить</button></li>)}</ul>
    </div>
  );
}

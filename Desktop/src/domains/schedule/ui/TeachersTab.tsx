import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";

export function TeachersTab() {
  const [list, setList] = useState<ScheduleState["teachers"]>([]);
  const [name, setName] = useState("");
  const load = async ()=> setList((await scheduleApi.getState()).teachers);
  useEffect(()=>{ load(); },[]);
  const add = async ()=>{
    if (!name.trim()) return;
    const avail = JSON.stringify(Array.from({length:6},()=>Array.from({length:8},()=>true)));
    await scheduleApi.upsertTeacher({ full_name: name, max_daily_lessons: 0, availability_json: avail });
    setName(""); load();
  };
  return (
    <div className="card">
      <h3>Учителя · матрица доступности 6×8</h3>
      <div className="row">
        <input placeholder="ФИО" value={name} onChange={e=>setName(e.target.value)} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      <ul>
        {list.map(t=> <li key={t.id}>{t.full_name} · макс. {t.max_daily_lessons} ур./день · <button className="btn btn-small" onClick={()=>scheduleApi.deleteTeacher(t.id).then(load)}>Удалить</button></li>)}
      </ul>
      <p className="muted">Матрица доступности — 6×8 чекбоксов (приходящие отмечают только свои слоты). Основной кабинет выбирается в редактировании.</p>
    </div>
  );
}

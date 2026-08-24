import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleSlot } from "../../../types";

export function LegacyTab() {
  const [quarter, setQuarter] = useState(1);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async (q: number)=>{
    setLoading(true);
    try{ setSlots(await scheduleApi.getLegacy(q)); } catch(e){ console.error(e); } finally{ setLoading(false); }
  };
  useEffect(()=>{ load(quarter); },[quarter]);
  const days = ["Пн","Вт","Ср","Чт","Пт"];
  const [filter, setFilter] = useState("");
  const filtered = slots.filter(s=> !filter || s.class_id.includes(filter) || s.teacher_id.includes(filter));
  return (
    <div className="card">
      <h3>Импортированное — недельный шаблон прошлого года (5×7, 1 неделя на четверть)</h3>
      <div className="row">
        {[1,2,3,4].map(q=> <button key={q} className={quarter===q?"btn btn-primary":"btn"} onClick={()=>setQuarter(q)}>Q{q}</button>)}
        <input placeholder="Фильтр класс/учитель" value={filter} onChange={e=>setFilter(e.target.value)} style={{minWidth:200}} />
      </div>
      {loading ? <p>Загрузка...</p> : (
        <div className="timetable-grid">
          <table className="table">
            <thead><tr><th>Слот</th>{days.map(d=> <th key={d}>{d}</th>)}</tr></thead>
            <tbody>
              {Array.from({length:7},(_,p)=> (
                <tr key={p}><th>{p+1}</th>{days.map((_,d)=> {
                  const cell = filtered.filter(s=>s.day===d && s.period===p);
                  return <td key={d}>{cell.slice(0,3).map(c=> <span key={c.id} className="chip" title={c.class_id}>{c.subject_id}<br/>{c.teacher_id.slice(0,8)}</span>).reduce((a,b)=> <>{a}{b}</>, <></>)}{cell.length>3 && <span className="muted">+{cell.length-3}</span>}</td>;
                })}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Тип классов разделены: {quarter} — normal/ДО/ЛУО в одном гриде (фильтр по class_id).</p>
    </div>
  );
}

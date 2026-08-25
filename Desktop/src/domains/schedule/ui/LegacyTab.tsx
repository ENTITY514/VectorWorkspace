import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleSlot } from "../../../types";

export function LegacyTab() {
  const [quarter, setQuarter] = useState(1);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async (q: number)=>{
    setLoading(true);
    try{ setSlots(await scheduleApi.getLegacy(q)); setWeekFilter("all"); } catch(e){ console.error(e); } finally{ setLoading(false); }
  };
  useEffect(()=>{ load(quarter); },[quarter]);
  const days = ["Пн","Вт","Ср","Чт","Пт"];
  const [filter, setFilter] = useState("");
  const [weekFilter, setWeekFilter] = useState("all");
  const weeks = [...new Set(slots.map(s => s.week).filter((w): w is number => typeof w === "number"))].sort((a, b) => a - b);
  const filtered = slots.filter(s => {
    if (weekFilter !== "all" && s.week !== Number(weekFilter)) return false;
    const teacher = s.source_teacher || s.teacher_id;
    const subject = s.source_subject || s.subject_id;
    return !filter || s.class_id.includes(filter) || teacher.toLowerCase().includes(filter.toLowerCase()) || subject.toLowerCase().includes(filter.toLowerCase());
  });
  return (
    <div className="card">
      <h3>Импортированное расписание прошлого года (5×7)</h3>
      <div className="row">
        {[1,2,3,4].map(q=> <button key={q} className={quarter===q?"btn btn-primary":"btn"} onClick={()=>setQuarter(q)}>Q{q}</button>)}
        {weeks.length > 1 && <select className="filter-select" value={weekFilter} onChange={e => setWeekFilter(e.target.value)}><option value="all">Все недели</option>{weeks.map(w => <option key={w} value={w}>Неделя {w}</option>)}</select>}
        <input placeholder="Фильтр класс/учитель" value={filter} onChange={e=>setFilter(e.target.value)} style={{minWidth:200}} />
      </div>
      {loading ? <p>Загрузка...</p> : (
        <div className="timetable-grid">
          <table className="table">
            <thead><tr><th>Слот</th>{days.map(d=> <th key={d}>{d}</th>)}</tr></thead>
            <tbody>
              {Array.from({length:8},(_,p)=> (
                <tr key={p}><th>{p+1}</th>{days.map((_,d)=> {
                  const cell = filtered.filter(s=>s.day===d && s.period===p);
                  return <td key={d}>{cell.slice(0,3).map(c=> <span key={c.id} className="chip" title={`${c.class_id} · ${c.source_time || ""} · ${c.source_note || ""}`}>{c.source_subject || c.subject_id}<br/>{c.source_teacher || c.teacher_id}</span>).reduce((a,b)=> <>{a}{b}</>, <></>)}{cell.length>3 && <span className="muted">+{cell.length-3}</span>}</td>;
                })}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
       <p className="muted">В расписании объединены normal/ДО/ЛУО. Фильтр ищет по классу, предмету и учителю.</p>
    </div>
  );
}

import { useState } from "react";
import type { ScheduleState } from "../../../types";

export function GridTab({ state }: { state: ScheduleState }) {
  const [filter, setFilter] = useState("");
  const slots = state.slots.filter(s=> !filter || s.class_id===filter || s.teacher_id===filter || s.room_id===filter);
  const days = ["Пн","Вт","Ср","Чт","Пт","Сб"];
  if (slots.length===0) return <div className="card"><p className="muted">Пусто — сгенерируйте расписание на вкладке Сводка.</p></div>;
  return (
    <div className="card">
      <h3>Матрица расписания</h3>
      <div className="row">
        <input placeholder="Фильтр: Класс / Учитель / Кабинет" value={filter} onChange={e=>setFilter(e.target.value)} style={{minWidth:300}} />
      </div>
      <div className="timetable-grid" role="grid">
        <table className="table">
          <thead><tr><th>Слот</th>{days.map(d=> <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {Array.from({length:7},(_,p)=> (
              <tr key={p}><th>{p+1} урок</th>{days.map((_,d)=> {
                const cell = slots.filter(s=>s.day===d && s.period===p);
                return <td key={d}>{cell.map(c=> <span key={c.id} className="chip" title={`${c.class_id} ${c.subject_id} ${c.teacher_id} ${c.room_id}`}>{c.subject_id}{c.subgroup_label?`(${c.subgroup_label})`:""}<br/>{c.teacher_id.slice(0,6)} · {c.room_id.slice(0,6)}</span>).reduce((a,b)=> <>{a}{b}</>, <></>)}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Подгруппы — диагональная ячейка (1гр/2гр) в один слот, разные учителя/кабинеты.</p>
    </div>
  );
}

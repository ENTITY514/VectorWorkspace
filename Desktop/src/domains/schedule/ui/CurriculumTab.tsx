import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";

export function CurriculumTab() {
  const [state, setState] = useState<ScheduleState | null>(null);
  const load = async ()=> setState(await scheduleApi.getState());
  useEffect(()=>{ load(); },[]);
  if (!state) return <div>Загрузка...</div>;
  return (
    <div className="card">
      <h3>Матрица нагрузки · Класс × Предмет → Учитель × Часы</h3>
      <p className="muted">Для предметов с делением укажите двух учителей (разных) и часы 1..6.</p>
      <table className="table curriculum-matrix">
        <thead><tr><th>Класс</th><th>Предмет</th><th>Учитель</th><th>Часы</th></tr></thead>
        <tbody>
          {state.curriculum.length===0 ? <tr><td colSpan={4} className="muted">Нагрузка пуста — добавьте через интерфейс</td></tr> :
            state.curriculum.map(c=> <tr key={c.id}><td>{c.class_id}</td><td>{c.subject_id}</td><td>{c.teacher_id}{c.split_teacher2_id?` / ${c.split_teacher2_id}`:""}</td><td>{c.hours_per_week}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

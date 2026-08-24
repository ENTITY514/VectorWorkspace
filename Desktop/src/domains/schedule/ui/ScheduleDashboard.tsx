import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";

export function ScheduleDashboard({ state, onGenerate, onRefresh }: { state: ScheduleState; onGenerate: ()=>void; onRefresh: ()=>void }) {
  const readiness = [
    { label: "Учителя", ok: state.teachers.length > 0, count: state.teachers.length },
    { label: "Классы", ok: state.classes.length > 0, count: state.classes.length },
    { label: "Кабинеты", ok: state.rooms.length > 0, count: state.rooms.length },
    { label: "Предметы", ok: state.subjects.length > 0, count: state.subjects.length },
    { label: "Нагрузка", ok: state.curriculum.length > 0, count: state.curriculum.length },
  ];
  const ready = readiness.every(r=>r.ok);
  const slots = state.slots;
  const importLegacy = async (q: number)=>{
    try {
      await scheduleApi.importLegacy(q);
      await onRefresh();
      alert(`Импорт Q${q} выполнен`);
    } catch(e){ alert(String(e)); }
  };
  return (
    <div className="dashboard">
      <div className="card">
        <h3>Готовность</h3>
        <div className="readiness">
          {readiness.map(r=> (
            <span key={r.label} className={r.ok?"badge badge-green":"badge"}>{r.label}: {r.count} {r.ok?"✓":"✗"}</span>
          ))}
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!ready} onClick={onGenerate} title={ready?"":"Заполните справочники и нагрузку"}>Сгенерировать</button>
          <button className="btn" onClick={onRefresh}>Обновить</button>
          <button className="btn" onClick={()=>scheduleApi.clearSlots().then(onRefresh)}>Очистить слоты</button>
        </div>
        {!ready && <p className="muted">Заполните все справочники и матрицу нагрузки чтобы активировать генерацию.</p>}
      </div>

      <div className="card">
        <h3>Импорт данных прошлого года</h3>
        <p className="muted">Загрузить недельный шаблон прошлого года (27 классов, 39 учителей) по четвертям — 1 неделя достаточно.</p>
        <div className="row">
          {[1,2,3,4].map(q=> <button key={q} className="btn" onClick={()=>importLegacy(q)}>Импорт Q{q}</button>)}
        </div>
      </div>

      <div className="card">
        <h3>Результат</h3>
        {slots.length===0 ? <p className="muted">Расписание ещё не сгенерировано.</p> : <p>Слотов: {slots.length} · Пример: {slots[0].class_id} {slots[0].subject_id} {slots[0].day+1}-{slots[0].period+1}</p>}
      </div>
    </div>
  );
}

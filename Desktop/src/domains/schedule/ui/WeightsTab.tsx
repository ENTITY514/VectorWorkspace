import { useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState, ScheduleWeights } from "../../../types";
import { WEIGHT_LABELS } from "../../../types";

export function WeightsTab({ state, onSaved }: { state: ScheduleState; onSaved: ()=>void }) {
  const [w, setW] = useState(state.weights);
  const save = async ()=>{
    await scheduleApi.setWeights({ window: w.window, room_displacement: w.room_displacement, sanpin_parabola: w.sanpin_parabola, alternation: w.alternation, movement: w.movement, load_balance: w.load_balance });
    onSaved();
  };
  const slider = (key: keyof ScheduleWeights, label: string) => (
    <div className="slider-row" key={key}>
      <label>{label} {w[key]===0 && <span className="badge">Отключено</span>}</label>
      <input type="range" min={0} max={1000} value={w[key]} onChange={e=>setW({...w,[key]:Number(e.target.value)})} />
      <span className="value">{w[key]}</span>
    </div>
  );
  return (
    <div className="card">
      <h3>Веса ограничений · 0 = отключено</h3>
      {slider("window", WEIGHT_LABELS.window)}
      {slider("room_displacement", WEIGHT_LABELS.room_displacement)}
      {slider("sanpin_parabola", WEIGHT_LABELS.sanpin_parabola)}
      {slider("alternation", WEIGHT_LABELS.alternation)}
      {slider("movement", WEIGHT_LABELS.movement)}
      {slider("load_balance", WEIGHT_LABELS.load_balance)}
      <button className="btn btn-primary" onClick={save}>Сохранить веса</button>
      <p className="muted">Вес 0 мгновенно отключает ограничение без пересборки модели.</p>
    </div>
  );
}

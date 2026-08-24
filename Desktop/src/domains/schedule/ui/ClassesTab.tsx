import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { SHIFT_LABELS } from "../../../types";

export function ClassesTab() {
  const [list, setList] = useState<ScheduleState["classes"]>([]);
  const [grade, setGrade] = useState(8);
  const [letter, setLetter] = useState("А");
  const [search, setSearch] = useState("");
  const load = async () => setList((await scheduleApi.getState()).classes);
  useEffect(() => { load(); }, []);
  const add = async () => {
    await scheduleApi.upsertClass({ grade, letter, headcount: 25, shift: "First" });
    load();
  };
  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c => `${c.grade}${c.letter}`.toLowerCase().includes(q));
  }, [list, search]);
  return (
    <div className="card">
      <h3>Классы · смены и подгруппы</h3>
      <div className="row">
        <input type="number" value={grade} onChange={e => setGrade(Number(e.target.value))} style={{ width: 80 }} />
        <input value={letter} onChange={e => setLetter(e.target.value)} style={{ width: 80 }} />
        <button className="btn" onClick={add}>Добавить класс</button>
      </div>
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по классу..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>{filtered.map(c => <li key={c.id}>{c.grade}{c.letter} · {SHIFT_LABELS[c.shift]} смена · {c.headcount} чел <button className="btn btn-small" onClick={() => scheduleApi.deleteClass(c.id).then(load)}>Удалить</button></li>)}</ul>
    </div>
  );
}

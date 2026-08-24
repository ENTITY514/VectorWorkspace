import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";

export function SubjectsTab() {
  const [list, setList] = useState<ScheduleState["subjects"]>([]);
  const [id, setId] = useState("");
  const [sname, setSname] = useState("");
  const [search, setSearch] = useState("");
  const load = async () => setList((await scheduleApi.getState()).subjects);
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!id.trim() || !sname.trim()) return;
    await scheduleApi.upsertSubject({ id: id.trim(), name: sname.trim(), sanitary_weight: 5, requires_split: false, is_double_allowed: false, related_subjects_json: "[]" });
    setId(""); setSname(""); load();
  };
  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(s => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [list, search]);
  return (
    <div className="card">
      <h3>Предметы · вес СанПиН 1..10 · спецкабинет · деление</h3>
      <div className="row">
        <input placeholder="id (напр. algebra)" value={id} onChange={e => setId(e.target.value)} />
        <input placeholder="Название" value={sname} onChange={e => setSname(e.target.value)} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по id или названию..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>{filtered.map(s => <li key={s.id}>{s.id} · {s.name} · вес {s.sanitary_weight} · {s.requires_split ? "деление" : ""} <button className="btn btn-small" onClick={() => scheduleApi.deleteSubject(s.id).then(load)}>Удалить</button></li>)}</ul>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";

export function SubjectsTab() {
  const [list, setList] = useState<ScheduleState["subjects"]>([]);
  const [id, setId] = useState("");
  const [sname, setSname] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editWeight, setEditWeight] = useState(5);
  const [editSplit, setEditSplit] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => setList((await scheduleApi.getState()).subjects);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const newErrors: Record<string, string> = {};
    if (!id.trim()) newErrors.id = "ID обязателен";
    if (!sname.trim()) newErrors.name = "Название обязательно";
    if (list.some(s => s.id === id.trim())) newErrors.id = "ID уже существует";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertSubject({ id: id.trim(), name: sname.trim(), sanitary_weight: 5, requires_split: false, is_double_allowed: false, related_subjects_json: "[]" });
    setId(""); setSname(""); setErrors({}); load();
  };

  const startEdit = (s: ScheduleState["subjects"][0]) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditWeight(s.sanitary_weight);
    setEditSplit(s.requires_split);
    setErrors({});
  };

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (!editName.trim()) newErrors.editName = "Название обязательно";
    if (editWeight < 1 || editWeight > 10) newErrors.editWeight = "Вес 1..10";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    const s = list.find(x => x.id === id);
    if (!s) return;
    await scheduleApi.upsertSubject({ id, name: editName, sanitary_weight: editWeight, requires_split: editSplit, is_double_allowed: s.is_double_allowed, related_subjects_json: s.related_subjects_json });
    setEditingId(null); setErrors({}); load();
  };

  const deleteSubject = (id: string, label: string) => {
    if (window.confirm(`Удалить предмет «${label}»?`)) {
      scheduleApi.deleteSubject(id).then(load);
    }
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
        <input placeholder="id (напр. algebra)" value={id} onChange={e => { setId(e.target.value); setErrors({}); }} />
        <input placeholder="Название" value={sname} onChange={e => { setSname(e.target.value); setErrors({}); }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.id && <p className="field-error">{errors.id}</p>}
      {errors.name && <p className="field-error">{errors.name}</p>}
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по id или названию..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>
        {filtered.map(s => (
          <li key={s.id}>
            {editingId === s.id ? (
              <>
                <input value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} style={{ minWidth: 120 }} />
                <input type="number" value={editWeight} onChange={e => setEditWeight(Number(e.target.value))} style={{ width: 60 }} />
                <label><input type="checkbox" checked={editSplit} onChange={e => setEditSplit(e.target.checked)} /> Деление</label>
                <button className="btn btn-small btn-primary" onClick={() => saveEdit(s.id)}>Сохранить</button>
                <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
              </>
            ) : (
              <>
                <span className="clickable" onClick={() => startEdit(s)}>{s.id} · {s.name} · вес {s.sanitary_weight} · {s.requires_split ? "деление" : ""}</span>
                <button className="btn btn-small" onClick={() => deleteSubject(s.id, s.name)}>Удалить</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";

export function TeachersTab() {
  const [list, setList] = useState<ScheduleState["teachers"]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMax, setEditMax] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => setList((await scheduleApi.getState()).teachers);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "ФИО обязателен";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    const avail = JSON.stringify(Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => true)));
    await scheduleApi.upsertTeacher({ full_name: name, max_daily_lessons: 0, availability_json: avail });
    setName(""); setErrors({}); load();
  };

  const startEdit = (t: ScheduleState["teachers"][0]) => {
    setEditingId(t.id);
    setEditName(t.full_name);
    setEditMax(t.max_daily_lessons);
    setErrors({});
  };

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (!editName.trim()) newErrors.editName = "ФИО обязателен";
    if (editMax < 0 || editMax > 10) newErrors.editMax = "Макс. 0..10";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    const t = list.find(x => x.id === id);
    if (!t) return;
    await scheduleApi.upsertTeacher({ id, full_name: editName, max_daily_lessons: editMax, availability_json: t.availability_json });
    setEditingId(null); setErrors({}); load();
  };

  const deleteTeacher = (id: string, label: string) => {
    if (window.confirm(`Удалить учителя «${label}»?`)) {
      scheduleApi.deleteTeacher(id).then(load);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(t => t.full_name.toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="card">
      <h3>Учителя · матрица доступности 6×8</h3>
      <div className="row">
        <input placeholder="ФИО" value={name} onChange={e => { setName(e.target.value); setErrors({}); }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по ФИО..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>
        {filtered.map(t => (
          <li key={t.id}>
            {editingId === t.id ? (
              <>
                <input value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} style={{ minWidth: 150 }} />
                <input type="number" value={editMax} onChange={e => setEditMax(Number(e.target.value))} style={{ width: 60 }} />
                <button className="btn btn-small btn-primary" onClick={() => saveEdit(t.id)}>Сохранить</button>
                <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
                {errors.editName && <p className="field-error">{errors.editName}</p>}
                {errors.editMax && <p className="field-error">{errors.editMax}</p>}
              </>
            ) : (
              <>
                <span className="clickable" onClick={() => startEdit(t)}>{t.full_name} · макс. {t.max_daily_lessons} ур./день</span>
                <button className="btn btn-small" onClick={() => deleteTeacher(t.id, t.full_name)}>Удалить</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="muted">Нажмите на учителя для редактирования. Матрица доступности — 6×8 чекбоксов.</p>
    </div>
  );
}

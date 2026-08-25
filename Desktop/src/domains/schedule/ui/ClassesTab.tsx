import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState, Shift } from "../../../types";
import { SHIFT_LABELS } from "../../../types";

export function ClassesTab() {
  const [list, setList] = useState<ScheduleState["classes"]>([]);
  const [grade, setGrade] = useState(8);
  const [letter, setLetter] = useState("А");
  const [klassType, setKlassType] = useState("normal");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrade, setEditGrade] = useState(8);
  const [editLetter, setEditLetter] = useState("");
  const [editShift, setEditShift] = useState<Shift>("First");
  const [editHeadcount, setEditHeadcount] = useState(25);
  const [editKlassType, setEditKlassType] = useState("normal");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => setList((await scheduleApi.getState()).classes);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const newErrors: Record<string, string> = {};
    if (grade < 1 || grade > 11) newErrors.grade = "Класс 1..11";
    if (klassType === "normal" && !letter.trim()) newErrors.letter = "Буква обязательна (для ДО/ЛУО может быть пусто)";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertClass({ grade, letter: letter.trim(), headcount: 25, shift: "First", class_type: klassType });
    setErrors({}); load();
  };

  const startEdit = (c: ScheduleState["classes"][0]) => {
    setEditingId(c.id);
    setEditGrade(c.grade);
    setEditLetter(c.letter);
    setEditShift(c.shift);
    setEditHeadcount(c.headcount);
    setEditKlassType((c as any).class_type || "normal");
    setErrors({});
  };

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (editGrade < 1 || editGrade > 11) newErrors.editGrade = "Класс 1..11";
    if (editKlassType === "normal" && !editLetter.trim()) newErrors.editLetter = "Буква обязательна";
    if (editHeadcount < 1 || editHeadcount > 50) newErrors.editHeadcount = "Ученики 1..50";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertClass({ id, grade: editGrade, letter: editLetter.trim(), headcount: editHeadcount, shift: editShift, class_type: editKlassType });
    setEditingId(null); setErrors({}); load();
  };

  const deleteClass = (id: string, label: string) => {
    if (window.confirm(`Удалить класс «${label}»?`)) {
      scheduleApi.deleteClass(id).then(load);
    }
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
        <input type="number" value={grade} onChange={e => { setGrade(Number(e.target.value)); setErrors({}); }} style={{ width: 80 }} />
        <input value={letter} placeholder="Буква (пусто для ДО/ЛУО)" onChange={e => { setLetter(e.target.value); setErrors({}); }} style={{ width: 120 }} />
        <select value={klassType} onChange={e=>setKlassType(e.target.value)} style={{ width: 120 }}>
          <option value="normal">Обычный</option>
          <option value="do">ДО</option>
          <option value="luo">ЛУО</option>
        </select>
        <button className="btn" onClick={add}>Добавить класс</button>
      </div>
      {errors.grade && <p className="field-error">{errors.grade}</p>}
      {errors.letter && <p className="field-error">{errors.letter}</p>}
      {list.length > 5 && (
        <div className="row">
          <input placeholder="Поиск по классу..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul>
        {filtered.map(c => (
          <li key={c.id}>
            {editingId === c.id ? (
              <>
                <input type="number" value={editGrade} onChange={e => setEditGrade(Number(e.target.value))} style={{ width: 60 }} />
                <input value={editLetter} placeholder="Б" onChange={e => setEditLetter(e.target.value)} style={{ width: 60 }} />
                <select value={editKlassType} onChange={e=>setEditKlassType(e.target.value)} style={{ width: 90 }}>
                  <option value="normal">Обычн</option>
                  <option value="do">ДО</option>
                  <option value="luo">ЛУО</option>
                </select>
                <select value={editShift} onChange={e => setEditShift(e.target.value as Shift)}>
                  <option value="First">Первая</option>
                  <option value="Second">Вторая</option>
                </select>
                <input type="number" value={editHeadcount} onChange={e => setEditHeadcount(Number(e.target.value))} style={{ width: 60 }} />
                <button className="btn btn-small btn-primary" onClick={() => saveEdit(c.id)}>Сохранить</button>
                <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
              </>
            ) : (
              <>
                <span className="clickable" onClick={() => startEdit(c)}>{c.grade}{c.letter} {(c as any).class_type && (c as any).class_type!=="normal" ? `(${(c as any).class_type.toUpperCase()})` : ""} · {SHIFT_LABELS[c.shift]} смена · {c.headcount} чел</span>
                <button className="btn btn-small" onClick={() => deleteClass(c.id, `${c.grade}${c.letter}`)}>Удалить</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

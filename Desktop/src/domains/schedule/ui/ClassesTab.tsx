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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState<"all" | "normal" | "do" | "luo">("all");

  // modal (settings) state
  const [modalClass, setModalClass] = useState<ScheduleState["classes"][0] | null>(null);
  const [editGrade, setEditGrade] = useState(8);
  const [editLetter, setEditLetter] = useState("");
  const [editShift, setEditShift] = useState<Shift>("First");
  const [editHeadcount, setEditHeadcount] = useState(25);
  const [editKlassType, setEditKlassType] = useState("normal");

  const TYPE_LABELS: Record<string, string> = { normal: "стд.", do: "ДО", luo: "ЛУО" };

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

  const openModal = (c: ScheduleState["classes"][0]) => {
    setModalClass(c);
    setEditGrade(c.grade);
    setEditLetter(c.letter);
    setEditShift(c.shift);
    setEditHeadcount(c.headcount);
    setEditKlassType((c as any).class_type || "normal");
    setErrors({});
  };

  const closeModal = () => setModalClass(null);

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (editGrade < 1 || editGrade > 11) newErrors.editGrade = "Класс 1..11";
    if (editKlassType === "normal" && !editLetter.trim()) newErrors.editLetter = "Буква обязательна";
    if (editHeadcount < 1 || editHeadcount > 50) newErrors.editHeadcount = "Ученики 1..50";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertClass({ id, grade: editGrade, letter: editLetter.trim(), headcount: editHeadcount, shift: editShift, class_type: editKlassType });
    setErrors({}); closeModal(); load();
  };

  const deleteClass = (id: string, label: string) => {
    if (window.confirm(`Удалить класс «${label}»?`)) {
      scheduleApi.deleteClass(id).then(() => { setModalClass(null); load(); });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(c => {
      if (filterType !== "all" && (c as any).class_type !== filterType) return false;
      if (q && !`${c.grade}${c.letter}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, search, filterType]);

  return (
    <div className="card">
      <h3>Классы · смены и подгруппы</h3>
      <div className="row">
        <input type="number" value={grade} onChange={e => { setGrade(Number(e.target.value)); setErrors({}); }} style={{ width: 80 }} />
        <input value={letter} placeholder="Буква (пусто для ДО/ЛУО)" onChange={e => { setLetter(e.target.value); setErrors({}); }} style={{ width: 120 }} />
        <select className="filter-select" value={klassType} onChange={e=>setKlassType(e.target.value)}>
          <option value="normal">Обычный</option>
          <option value="do">ДО</option>
          <option value="luo">ЛУО</option>
        </select>
        <button className="btn" onClick={add}>Добавить класс</button>
      </div>
      {errors.grade && <p className="field-error">{errors.grade}</p>}
      {errors.letter && <p className="field-error">{errors.letter}</p>}

      {list.length > 0 && (
        <div className="filter-selects">
          <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value as "all" | "normal" | "do" | "luo")}>
            <option value="all">Все типы</option>
            <option value="normal">Обычные</option>
            <option value="do">ДО</option>
            <option value="luo">ЛУО</option>
          </select>
          <input className="search-input" placeholder="Поиск по классу..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted">Нет классов по выбранному фильтру.</p>
      ) : (
        <table className="table centered">
          <thead>
            <tr>
              <th>Класс</th>
              <th>Тип</th>
              <th>Смена</th>
              <th>Учеников</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const ct = (c as any).class_type || "normal";
              return (
                <tr key={c.id} className="clickable" onClick={() => openModal(c)}>
                  <td>{c.grade}{c.letter}</td>
                  <td>
                    <span className={`badge ${ct === "luo" ? "badge-green" : ct === "do" ? "badge-amber" : ""}`}>{TYPE_LABELS[ct]}</span>
                  </td>
                  <td>{SHIFT_LABELS[c.shift]}</td>
                  <td>{c.headcount}</td>
                  <td>
                    <button
                      className="btn btn-small"
                      onClick={(e) => { e.stopPropagation(); deleteClass(c.id, `${c.grade}${c.letter}`); }}
                    >Удалить</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modalClass && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal classes-modal" onClick={e => e.stopPropagation()}>
            <h3>Настройки класса · {editGrade}{editLetter || ""}</h3>
            <div className="form-grid">
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Класс</label>
                  <input type="number" className="search-input" value={editGrade} onChange={e => { setEditGrade(Number(e.target.value)); setErrors({}); }} />
                </div>
                <div className="form-field">
                  <label className="form-label">Буква</label>
                  <input className="search-input" value={editLetter} placeholder="Б" onChange={e => { setEditLetter(e.target.value); setErrors({}); }} />
                </div>
                <div className="form-field">
                  <label className="form-label">Тип</label>
                  <select className="filter-select" value={editKlassType} onChange={e => setEditKlassType(e.target.value)}>
                    <option value="normal">Обычный</option>
                    <option value="do">ДО</option>
                    <option value="luo">ЛУО</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Смена</label>
                  <select className="filter-select" value={editShift} onChange={e => setEditShift(e.target.value as Shift)}>
                    <option value="First">Первая</option>
                    <option value="Second">Вторая</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Учеников</label>
                  <input type="number" className="search-input" value={editHeadcount} onChange={e => { setEditHeadcount(Number(e.target.value)); setErrors({}); }} />
                </div>
              </div>
            </div>
            {errors.editGrade && <p className="field-error">{errors.editGrade}</p>}
            {errors.editLetter && <p className="field-error">{errors.editLetter}</p>}
            {errors.editHeadcount && <p className="field-error">{errors.editHeadcount}</p>}
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-small" onClick={() => deleteClass(modalClass.id, `${editGrade}${editLetter}`)}>Удалить</button>
              <button className="btn" onClick={closeModal}>Отмена</button>
              <button className="btn btn-primary" onClick={() => saveEdit(modalClass.id)}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

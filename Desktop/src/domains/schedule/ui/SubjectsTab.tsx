import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState } from "../../../types";
import { showToast } from "../../../components/Toast";

function slugFromName(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-zа-яё0-9_]/g, "");
  return s || `subj_${Date.now().toString(36)}`;
}

export function SubjectsTab() {
  const [list, setList] = useState<ScheduleState["subjects"]>([]);
  const [sname, setSname] = useState("");
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [modalSubject, setModalSubject] = useState<ScheduleState["subjects"][0] | null>(null);
  const [editName, setEditName] = useState("");
  const [editWeight, setEditWeight] = useState(5);
  const [editSplit, setEditSplit] = useState(false);

  const load = async () => setList((await scheduleApi.getState()).subjects);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const newErrors: Record<string, string> = {};
    if (!sname.trim()) newErrors.name = "Название обязательно";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    let baseId = slugFromName(sname);
    let id = baseId;
    let n = 1;
    while (list.some(s => s.id === id)) id = `${baseId}_${n++}`;
    await scheduleApi.upsertSubject({ id, name: sname.trim(), sanitary_weight: 5, requires_split: false, is_double_allowed: false, related_subjects_json: "[]" });
    setSname(""); setErrors({}); load();
    showToast("Предмет добавлен", "success");
  };

  const openModal = (s: ScheduleState["subjects"][0]) => {
    setModalSubject(s);
    setEditName(s.name);
    setEditWeight(s.sanitary_weight);
    setEditSplit(s.requires_split);
    setErrors({});
  };
  const closeModal = () => setModalSubject(null);

  const saveEdit = async () => {
    if (!modalSubject) return;
    const newErrors: Record<string, string> = {};
    if (!editName.trim()) newErrors.editName = "Название обязательно";
    if (editWeight < 1 || editWeight > 10) newErrors.editWeight = "Вес 1..10";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await scheduleApi.upsertSubject({ id: modalSubject.id, name: editName.trim(), sanitary_weight: editWeight, requires_split: editSplit, is_double_allowed: modalSubject.is_double_allowed, related_subjects_json: modalSubject.related_subjects_json });
    setErrors({}); closeModal(); load();
    showToast("Предмет обновлён", "success");
  };

  const deleteSubject = (id: string, label: string) => {
    if (window.confirm(`Удалить предмет «${label}»?`)) {
      scheduleApi.deleteSubject(id).then(() => { setModalSubject(null); load(); showToast("Предмет удалён", "success"); });
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(s => s.name.toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="card">
      <h3>Предметы · вес СанПиН 1..10 · деление</h3>
      <div className="row">
        <input placeholder="Название предмета" value={sname} onChange={e => { setSname(e.target.value); setErrors({}); }} style={{ minWidth: 240 }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}

      {list.length > 0 && (
        <div className="filter-selects" style={{ marginTop: 12 }}>
          <input className="search-input" placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {list.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>Список пуст — нажмите «Обновить» на сводке или перезапустите приложение для автоимпорта Q4.</p>
      ) : filtered.length === 0 ? (
        <p className="muted">Нет предметов по выбранному фильтру.</p>
      ) : (
        <table className="table centered" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Вес</th>
              <th>Деление</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="clickable" onClick={() => openModal(s)}>
                <td className="cell-main">{s.name}</td>
                <td>{s.sanitary_weight}</td>
                <td>{s.requires_split ? <span className="badge badge-green">Да</span> : <span className="muted">—</span>}</td>
                <td>
                  <button className="btn btn-small" onClick={(e) => { e.stopPropagation(); deleteSubject(s.id, s.name); }}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalSubject && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Предмет · {modalSubject.name}</h3>
            <div className="form-grid">
              <div className="form-row">
                <div className="form-field" style={{ flex: 1 }}>
                  <label className="form-label">Название</label>
                  <input className="search-input" value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} />
                </div>
                <div className="form-field" style={{ width: 100 }}>
                  <label className="form-label">Вес (1..10)</label>
                  <input type="number" className="search-input" value={editWeight} onChange={e => setEditWeight(Number(e.target.value))} />
                </div>
                <div className="form-field" style={{ width: 140, justifyContent: "flex-end" }}>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 22 }}>
                    <input type="checkbox" checked={editSplit} onChange={e => setEditSplit(e.target.checked)} /> Деление
                  </label>
                </div>
              </div>
            </div>
            {errors.editName && <p className="field-error">{errors.editName}</p>}
            {errors.editWeight && <p className="field-error">{errors.editWeight}</p>}
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-small" onClick={() => deleteSubject(modalSubject.id, editName)}>Удалить</button>
              <button className="btn" onClick={closeModal}>Отмена</button>
              <button className="btn btn-primary" onClick={saveEdit}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

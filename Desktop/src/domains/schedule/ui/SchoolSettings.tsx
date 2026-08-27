import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState, RoomType, Shift } from "../../../types";
import { ROOM_TYPE_LABELS, SHIFT_LABELS } from "../../../types";
import { showToast } from "../../../components/Toast";

type SettingsTab = "subjects" | "classes" | "rooms";

function slugFromName(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-zа-яё0-9_]/g, "");
  return s || `subj_${Date.now().toString(36)}`;
}

export function SchoolSettings() {
  const [tab, setTab] = useState<SettingsTab>("subjects");
  const [state, setState] = useState<ScheduleState | null>(null);

  const load = async () => setState(await scheduleApi.getState());
  useEffect(() => { load(); }, []);

  if (!state) return <p className="muted">Загрузка...</p>;

  return (
    <div className="card">
      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        {(["subjects", "classes", "rooms"] as SettingsTab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
            {{ subjects: "Предметы", classes: "Классы", rooms: "Кабинеты" }[t]}
          </button>
        ))}
      </div>
      {tab === "subjects" && <SubjectsPanel subjects={state.subjects} onRefresh={load} />}
      {tab === "classes" && <ClassesPanel classes={state.classes} onRefresh={load} />}
      {tab === "rooms" && <RoomsPanel rooms={state.rooms} onRefresh={load} />}
    </div>
  );
}

/* ─── Subjects Panel ─── */
function SubjectsPanel({ subjects, onRefresh }: { subjects: ScheduleState["subjects"]; onRefresh: () => void }) {
  const [sname, setSname] = useState("");
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [modalSubject, setModalSubject] = useState<ScheduleState["subjects"][0] | null>(null);
  const [editName, setEditName] = useState("");
  const [editWeight, setEditWeight] = useState(5);
  const [editSplit, setEditSplit] = useState(false);

  const add = async () => {
    if (!sname.trim()) { setErrors({ name: "Название обязательно" }); return; }
    let baseId = slugFromName(sname);
    let id = baseId;
    let n = 1;
    while (subjects.some(s => s.id === id)) id = `${baseId}_${n++}`;
    await scheduleApi.upsertSubject({ id, name: sname.trim(), sanitary_weight: 5, requires_split: false, is_double_allowed: false, related_subjects_json: "[]" });
    setSname(""); setErrors({}); onRefresh();
    showToast("Предмет добавлен", "success");
  };

  const openModal = (s: ScheduleState["subjects"][0]) => {
    setModalSubject(s); setEditName(s.name); setEditWeight(s.sanitary_weight); setEditSplit(s.requires_split); setErrors({});
  };

  const saveEdit = async () => {
    if (!modalSubject) return;
    if (!editName.trim()) { setErrors({ editName: "Название обязательно" }); return; }
    if (editWeight < 1 || editWeight > 10) { setErrors({ editWeight: "Вес 1..10" }); return; }
    await scheduleApi.upsertSubject({ id: modalSubject.id, name: editName.trim(), sanitary_weight: editWeight, requires_split: editSplit, is_double_allowed: modalSubject.is_double_allowed, related_subjects_json: modalSubject.related_subjects_json });
    setErrors({}); setModalSubject(null); onRefresh();
    showToast("Предмет обновлён", "success");
  };

  const deleteSubject = (id: string, label: string) => {
    if (window.confirm(`Удалить предмет «${label}»?`)) {
      scheduleApi.deleteSubject(id).then(() => { setModalSubject(null); onRefresh(); showToast("Предмет удалён", "success"); });
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return subjects;
    const q = search.toLowerCase();
    return subjects.filter(s => s.name.toLowerCase().includes(q));
  }, [subjects, search]);

  return (
    <>
      <div className="row">
        <input placeholder="Название предмета" value={sname} onChange={e => { setSname(e.target.value); setErrors({}); }} style={{ minWidth: 240 }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}
      {subjects.length > 0 && (
        <div className="filter-selects" style={{ marginTop: 12 }}>
          <input className="search-input" placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>Список пуст.</p>
      ) : (
        <table className="table centered" style={{ marginTop: 12 }}>
          <thead><tr><th>Название</th><th>Вес</th><th>Деление</th><th></th></tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="clickable" onClick={() => openModal(s)}>
                <td className="cell-main">{s.name}</td>
                <td>{s.sanitary_weight}</td>
                <td>{s.requires_split ? <span className="badge badge-green">Да</span> : <span className="muted">—</span>}</td>
                <td><button className="btn btn-small" onClick={e => { e.stopPropagation(); deleteSubject(s.id, s.name); }}>Удалить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modalSubject && (
        <div className="modal-overlay" onClick={() => setModalSubject(null)}>
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
              <button className="btn" onClick={() => setModalSubject(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={saveEdit}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Classes Panel ─── */
function ClassesPanel({ classes, onRefresh }: { classes: ScheduleState["classes"]; onRefresh: () => void }) {
  const [grade, setGrade] = useState(8);
  const [letter, setLetter] = useState("А");
  const [klassType, setKlassType] = useState("normal");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "normal" | "do" | "luo">("all");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [modalClass, setModalClass] = useState<ScheduleState["classes"][0] | null>(null);
  const [editGrade, setEditGrade] = useState(8);
  const [editLetter, setEditLetter] = useState("");
  const [editShift, setEditShift] = useState<Shift>("First");
  const [editHeadcount, setEditHeadcount] = useState(25);
  const [editKlassType, setEditKlassType] = useState("normal");
  const TYPE_LABELS: Record<string, string> = { normal: "стд.", do: "ДО", luo: "ЛУО" };

  const add = async () => {
    if (grade < 1 || grade > 11) { setErrors({ grade: "Класс 1..11" }); return; }
    if (klassType === "normal" && !letter.trim()) { setErrors({ letter: "Буква обязательна" }); return; }
    await scheduleApi.upsertClass({ grade, letter: letter.trim(), headcount: 25, shift: "First", class_type: klassType });
    setErrors({}); onRefresh();
  };

  const openModal = (c: ScheduleState["classes"][0]) => {
    setModalClass(c); setEditGrade(c.grade); setEditLetter(c.letter); setEditShift(c.shift);
    setEditHeadcount(c.headcount); setEditKlassType((c as any).class_type || "normal"); setErrors({});
  };

  const saveEdit = async (id: string) => {
    if (editGrade < 1 || editGrade > 11) { setErrors({ editGrade: "Класс 1..11" }); return; }
    if (editKlassType === "normal" && !editLetter.trim()) { setErrors({ editLetter: "Буква обязательна" }); return; }
    if (editHeadcount < 1 || editHeadcount > 50) { setErrors({ editHeadcount: "Ученики 1..50" }); return; }
    await scheduleApi.upsertClass({ id, grade: editGrade, letter: editLetter.trim(), headcount: editHeadcount, shift: editShift, class_type: editKlassType });
    setErrors({}); setModalClass(null); onRefresh();
  };

  const deleteClass = (id: string, label: string) => {
    if (window.confirm(`Удалить класс «${label}»?`)) {
      scheduleApi.deleteClass(id).then(() => { setModalClass(null); onRefresh(); });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter(c => {
      if (filterType !== "all" && (c as any).class_type !== filterType) return false;
      if (q && !`${c.grade}${c.letter}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [classes, search, filterType]);

  return (
    <>
      <div className="row">
        <input type="number" value={grade} onChange={e => { setGrade(Number(e.target.value)); setErrors({}); }} style={{ width: 80 }} />
        <input value={letter} placeholder="Буква" onChange={e => { setLetter(e.target.value); setErrors({}); }} style={{ width: 120 }} />
        <select className="filter-select" value={klassType} onChange={e => setKlassType(e.target.value)}>
          <option value="normal">Обычный</option>
          <option value="do">ДО</option>
          <option value="luo">ЛУО</option>
        </select>
        <button className="btn" onClick={add}>Добавить класс</button>
      </div>
      {errors.grade && <p className="field-error">{errors.grade}</p>}
      {errors.letter && <p className="field-error">{errors.letter}</p>}
      {classes.length > 0 && (
        <div className="filter-selects" style={{ marginTop: 12 }}>
          <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)}>
            <option value="all">Все типы</option>
            <option value="normal">Обычные</option>
            <option value="do">ДО</option>
            <option value="luo">ЛУО</option>
          </select>
          <input className="search-input" placeholder="Поиск по классу..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>Нет классов по выбранному фильтру.</p>
      ) : (
        <table className="table centered" style={{ marginTop: 12 }}>
          <thead><tr><th>Класс</th><th>Тип</th><th>Смена</th><th>Учеников</th><th></th></tr></thead>
          <tbody>
            {filtered.map(c => {
              const ct = (c as any).class_type || "normal";
              return (
                <tr key={c.id} className="clickable" onClick={() => openModal(c)}>
                  <td>{c.grade}{c.letter}</td>
                  <td><span className={`badge ${ct === "luo" ? "badge-green" : ct === "do" ? "badge-amber" : ""}`}>{TYPE_LABELS[ct]}</span></td>
                  <td>{SHIFT_LABELS[c.shift]}</td>
                  <td>{c.headcount}</td>
                  <td><button className="btn btn-small" onClick={e => { e.stopPropagation(); deleteClass(c.id, `${c.grade}${c.letter}`); }}>Удалить</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {modalClass && (
        <div className="modal-overlay" onClick={() => setModalClass(null)}>
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
                  <input className="search-input" value={editLetter} onChange={e => { setEditLetter(e.target.value); setErrors({}); }} />
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
                  <input type="number" className="search-input" value={editHeadcount} onChange={e => setEditHeadcount(Number(e.target.value))} />
                </div>
              </div>
            </div>
            {errors.editGrade && <p className="field-error">{errors.editGrade}</p>}
            {errors.editLetter && <p className="field-error">{errors.editLetter}</p>}
            {errors.editHeadcount && <p className="field-error">{errors.editHeadcount}</p>}
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-small" onClick={() => deleteClass(modalClass.id, `${editGrade}${editLetter}`)}>Удалить</button>
              <button className="btn" onClick={() => setModalClass(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => saveEdit(modalClass.id)}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Rooms Panel ─── */
function RoomsPanel({ rooms, onRefresh }: { rooms: ScheduleState["rooms"]; onRefresh: () => void }) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<RoomType>("General");
  const [editCapacity, setEditCapacity] = useState(30);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const add = async () => {
    if (!name.trim()) { setErrors({ name: "Название обязательно" }); return; }
    if (rooms.some(r => r.name === name.trim())) { setErrors({ name: "Название уже существует" }); return; }
    await scheduleApi.upsertRoom({ name, room_type: "General", capacity: 30 });
    setName(""); setErrors({}); onRefresh();
  };

  const startEdit = (r: ScheduleState["rooms"][0]) => {
    setEditingId(r.id); setEditName(r.name); setEditType(r.room_type); setEditCapacity(r.capacity); setErrors({});
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) { setErrors({ editName: "Название обязательно" }); return; }
    if (rooms.some(r => r.name === editName.trim() && r.id !== id)) { setErrors({ editName: "Название уже существует" }); return; }
    if (editCapacity < 1 || editCapacity > 200) { setErrors({ editCapacity: "Вместимость 1..200" }); return; }
    await scheduleApi.upsertRoom({ id, name: editName, room_type: editType, capacity: editCapacity });
    setEditingId(null); setErrors({}); onRefresh();
  };

  const deleteRoom = (id: string, label: string) => {
    if (window.confirm(`Удалить кабинет «${label}»?`)) scheduleApi.deleteRoom(id).then(onRefresh);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rooms;
    const q = search.toLowerCase();
    return rooms.filter(r => r.name.toLowerCase().includes(q));
  }, [rooms, search]);

  return (
    <>
      <div className="row">
        <input placeholder="Название" value={name} onChange={e => { setName(e.target.value); setErrors({}); }} />
        <button className="btn" onClick={add}>Добавить</button>
      </div>
      {errors.name && <p className="field-error">{errors.name}</p>}
      {rooms.length > 5 && (
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        </div>
      )}
      <ul style={{ marginTop: 12 }}>
        {filtered.map(r => (
          <li key={r.id}>
            {editingId === r.id ? (
              <>
                <input value={editName} onChange={e => { setEditName(e.target.value); setErrors({}); }} style={{ minWidth: 120 }} />
                <select value={editType} onChange={e => setEditType(e.target.value as RoomType)}>
                  {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="number" value={editCapacity} onChange={e => setEditCapacity(Number(e.target.value))} style={{ width: 60 }} />
                <button className="btn btn-small btn-primary" onClick={() => saveEdit(r.id)}>Сохранить</button>
                <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
              </>
            ) : (
              <>
                <span className="clickable" onClick={() => startEdit(r)}>{r.name} · {ROOM_TYPE_LABELS[r.room_type]} · {r.capacity}</span>
                <button className="btn btn-small" onClick={() => deleteRoom(r.id, r.name)}>Удалить</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

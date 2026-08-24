import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState, ScheduleCurriculum } from "../../../types";
import { showToast } from "../../../components/Toast";

export function CurriculumTab() {
  const [state, setState] = useState<ScheduleState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClassId, setEditClassId] = useState("");
  const [editSubjectId, setEditSubjectId] = useState("");
  const [editTeacherId, setEditTeacherId] = useState("");
  const [editSplitTeacher2, setEditSplitTeacher2] = useState("");
  const [editHours, setEditHours] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // New entry fields
  const [newClassId, setNewClassId] = useState("");
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newTeacherId, setNewTeacherId] = useState("");
  const [newSplitTeacher2, setNewSplitTeacher2] = useState("");
  const [newHours, setNewHours] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = async () => setState(await scheduleApi.getState());
  useEffect(() => { load(); }, []);

  if (!state) return <div className="card">Загрузка...</div>;

  const classOptions = state.classes.map(c => `${c.grade}${c.letter}`);
  const subjectOptions = state.subjects.map(s => s.id);
  const teacherOptions = state.teachers.map(t => t.id);

  const startEdit = (c: ScheduleCurriculum) => {
    setEditingId(c.id);
    setEditClassId(c.class_id);
    setEditSubjectId(c.subject_id);
    setEditTeacherId(c.teacher_id);
    setEditSplitTeacher2(c.split_teacher2_id || "");
    setEditHours(c.hours_per_week);
    setErrors({});
  };

  const saveEdit = async (id: string) => {
    const newErrors: Record<string, string> = {};
    if (!editClassId.trim()) newErrors.classId = "Класс обязателен";
    if (!editSubjectId.trim()) newErrors.subjectId = "Предмет обязателен";
    if (!editTeacherId.trim()) newErrors.teacherId = "Учитель обязателен";
    if (editHours < 1 || editHours > 6) newErrors.hours = "Часы 1..6";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    try {
      // Delete old and create new (simplified approach)
      await scheduleApi.deleteCurriculum(id);
      await scheduleApi.setCurriculum([{
        class_id: editClassId,
        subject_id: editSubjectId,
        teacher_id: editTeacherId,
        split_teacher2_id: editSplitTeacher2 || null,
        hours_per_week: editHours,
      }]);
      setEditingId(null); setErrors({}); load();
      showToast("Нагрузка обновлена", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const addEntry = async () => {
    const newErrors: Record<string, string> = {};
    if (!newClassId.trim()) newErrors.newClassId = "Класс обязателен";
    if (!newSubjectId.trim()) newErrors.newSubjectId = "Предмет обязателен";
    if (!newTeacherId.trim()) newErrors.newTeacherId = "Учитель обязателен";
    if (newHours < 1 || newHours > 6) newErrors.newHours = "Часы 1..6";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    try {
      await scheduleApi.setCurriculum([{
        class_id: newClassId,
        subject_id: newSubjectId,
        teacher_id: newTeacherId,
        split_teacher2_id: newSplitTeacher2 || null,
        hours_per_week: newHours,
      }]);
      setNewClassId(""); setNewSubjectId(""); setNewTeacherId(""); setNewSplitTeacher2(""); setNewHours(1);
      setShowAddForm(false); setErrors({}); load();
      showToast("Нагрузка добавлена", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const deleteEntry = async (id: string, label: string) => {
    if (window.confirm(`Удалить нагрузку «${label}»?`)) {
      try {
        await scheduleApi.deleteCurriculum(id);
        load();
        showToast("Нагрузка удалена", "success");
      } catch (e) {
        showToast(String(e), "error");
      }
    }
  };

  return (
    <div className="card">
      <h3>Матрица нагрузки · Класс × Предмет → Учитель × Часы</h3>
      <p className="muted">Для предметов с делением укажите двух учителей (разных) и часы 1..6.</p>

      <div className="actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? "Отмена" : "Добавить запись"}
        </button>
      </div>

      {showAddForm && (
        <div className="curriculum-add-form">
          <div className="row">
            <select value={newClassId} onChange={e => { setNewClassId(e.target.value); setErrors({}); }}>
              <option value="">Класс</option>
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={newSubjectId} onChange={e => { setNewSubjectId(e.target.value); setErrors({}); }}>
              <option value="">Предмет</option>
              {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={newTeacherId} onChange={e => { setNewTeacherId(e.target.value); setErrors({}); }}>
              <option value="">Учитель</option>
              {teacherOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="2-й учитель (если деление)" value={newSplitTeacher2} onChange={e => setNewSplitTeacher2(e.target.value)} style={{ width: 150 }} />
            <input type="number" min={1} max={6} value={newHours} onChange={e => setNewHours(Number(e.target.value))} style={{ width: 60 }} />
            <button className="btn btn-primary" onClick={addEntry}>Добавить</button>
          </div>
          {errors.newClassId && <p className="field-error">{errors.newClassId}</p>}
          {errors.newSubjectId && <p className="field-error">{errors.newSubjectId}</p>}
          {errors.newTeacherId && <p className="field-error">{errors.newTeacherId}</p>}
          {errors.newHours && <p className="field-error">{errors.newHours}</p>}
        </div>
      )}

      <table className="table curriculum-matrix">
        <thead>
          <tr>
            <th>Класс</th>
            <th>Предмет</th>
            <th>Учитель</th>
            <th>Часы</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {state.curriculum.length === 0 ? (
            <tr><td colSpan={5} className="muted">Нагрузка пуста — добавьте запись</td></tr>
          ) : (
            state.curriculum.map(c => (
              <tr key={c.id}>
                {editingId === c.id ? (
                  <>
                    <td>
                      <select value={editClassId} onChange={e => setEditClassId(e.target.value)}>
                        {classOptions.map(cl => <option key={cl} value={cl}>{cl}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={editSubjectId} onChange={e => setEditSubjectId(e.target.value)}>
                        {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={editTeacherId} onChange={e => setEditTeacherId(e.target.value)}>
                        {teacherOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" min={1} max={6} value={editHours} onChange={e => setEditHours(Number(e.target.value))} style={{ width: 60 }} />
                    </td>
                    <td>
                      <button className="btn btn-small btn-primary" onClick={() => saveEdit(c.id)}>Сохранить</button>
                      <button className="btn btn-small" onClick={() => setEditingId(null)}>Отмена</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{c.class_id}</td>
                    <td>{c.subject_id}</td>
                    <td>{c.teacher_id}{c.split_teacher2_id ? ` / ${c.split_teacher2_id}` : ""}</td>
                    <td>{c.hours_per_week}</td>
                    <td>
                      <button className="btn btn-small" onClick={() => startEdit(c)}>Ред.</button>
                      <button className="btn btn-small" onClick={() => deleteEntry(c.id, `${c.class_id} × ${c.subject_id}`)}>Удалить</button>
                    </td>
                  </>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

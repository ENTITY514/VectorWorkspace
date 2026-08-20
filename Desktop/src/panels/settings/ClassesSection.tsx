import { useState } from "react";
import { api } from "../../services/api";

import type { SchoolState } from "../../types";
import { SettingsSection } from "./SettingsSection";

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

export function ClassesSection({
  schoolId,
  classes,
  onSaved,
}: {
  schoolId: string;
  classes: SchoolState["classes"];
  onSaved: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [grade, setGrade] = useState<number>(7);
  const [letter, setLetter] = useState("");
  const [language, setLanguage] = useState<"RU" | "KK">("RU");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.saveClass({ schoolId, grade, letter: letter.trim(), language });
      setLetter("");
      setFormOpen(false);
      onSaved();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (classId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.deleteClass(classId);
      onSaved();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="Классы"
      subtitle="Физические классы («7 А»). Абстрактные параллели живут в ТУП — не дублируются."
    >
      <table className="data">
        <thead>
          <tr>
            <th>Класс</th>
            <th>Литера</th>
            <th>Язык</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.length === 0 && (
            <tr>
              <td colSpan={4} className="cell-sub">Классы не добавлены.</td>
            </tr>
          )}
          {classes.map((c) => (
            <tr key={c.id}>
              <td className="cell-main">{c.grade} класс</td>
              <td>{c.letter}</td>
              <td>
                <span className="badge badge-blue">{c.language === "RU" ? "Русский" : "Қазақ"}</span>
              </td>
              <td>
                <button className="btn btn-sm" disabled={busy} onClick={() => remove(c.id)}>
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {msg && <div className="form-hint">{msg}</div>}

      {formOpen ? (
        <div className="form-row" style={{ marginTop: 12, alignItems: "flex-end" }}>
          <div className="form-field">
            <label className="form-label">Класс</label>
            <select className="filter-select" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g} класс</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Литера</label>
            <input className="search-input" value={letter} onChange={(e) => setLetter(e.target.value)} placeholder="А" style={{ width: 90 }} />
          </div>
          <div className="form-field">
            <label className="form-label">Язык</label>
            <select className="filter-select" value={language} onChange={(e) => setLanguage(e.target.value as "RU" | "KK")}>
              <option value="RU">Русский</option>
              <option value="KK">Қазақ</option>
            </select>
          </div>
          <div className="form-field">
            <button className="btn btn-primary" disabled={busy || !letter.trim()} onClick={save}>
              Сохранить
            </button>
          </div>
          <div className="form-field">
            <button className="btn" onClick={() => setFormOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setFormOpen(true)}>
          + Добавить класс
        </button>
      )}
    </SettingsSection>
  );
}

import { useState } from "react";
import { api } from "../../services/api";

import type { SchoolState, StaffRole } from "../../types";
import { SettingsSection } from "./SettingsSection";

const STAFF_ROLES: StaffRole[] = ["Director", "DeputyDirector", "MethodHead", "Teacher"];
const ROLE_LABELS: Record<StaffRole, string> = {
  Director: "Директор",
  DeputyDirector: "Завуч",
  MethodHead: "Председатель МО",
  Teacher: "Учитель",
};

export function StaffSection({
  schoolId,
  staff,
  onSaved,
}: {
  schoolId: string;
  staff: SchoolState["staff"];
  onSaved: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [role, setRole] = useState<StaffRole>("Director");
  const [fullName, setFullName] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.saveStaff({
        schoolId,
        role,
        fullName: fullName.trim(),
        validFrom: validFrom || null,
      });
      setFullName("");
      setValidFrom("");
      setFormOpen(false);
      onSaved();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (staffId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.deactivateStaff(staffId);
      onSaved();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="Штат школы"
      subtitle="Должности: директор, завуч, председатель МО. Смена директора закрывает предыдущую ревизию."
    >
      <table className="data">
        <thead>
          <tr>
            <th>Должность</th>
            <th>ФИО</th>
            <th>Период</th>
            <th>Статус</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff.length === 0 && (
            <tr>
              <td colSpan={5} className="cell-sub">Штат пуст. Добавьте директора.</td>
            </tr>
          )}
          {staff.map((s) => (
            <tr key={s.id}>
              <td className="cell-main">{s.roleLabel}</td>
              <td>{s.fullName}</td>
              <td className="cell-sub">
                {s.validFrom ?? "—"} → {s.validTo ?? "н.в."}
              </td>
              <td>
                <span className={`badge ${s.isActive ? "badge-green" : "badge-gray"}`}>
                  {s.isActive ? "активен" : "неактивен"}
                </span>
              </td>
              <td>
                {s.isActive && (
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => deactivate(s.id)}
                    title="Завершить полномочия (is_active = 0, valid_to = сегодня)"
                  >
                    Уволить
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {msg && <div className="form-hint">{msg}</div>}

      {formOpen ? (
        <div className="form-row" style={{ marginTop: 12, alignItems: "flex-end" }}>
          <div className="form-field">
            <label className="form-label">Должность</label>
            <select className="filter-select" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ flex: 2 }}>
            <label className="form-label">ФИО</label>
            <input
              className="search-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Фамилия Имя Отчество"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Дата вступления</label>
            <input
              type="date"
              className="search-input"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div className="form-field">
            <button className="btn btn-primary" disabled={busy || !fullName.trim()} onClick={save}>
              Сохранить
            </button>
          </div>
          <div className="form-field">
            <button className="btn" onClick={() => setFormOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setFormOpen(true)}>
          + Добавить должность
        </button>
      )}
    </SettingsSection>
  );
}

import { useState } from "react";
import { api } from "../../services/api";

import { SettingsSection } from "./SettingsSection";

export function ProfileSection({
  fullName,
  category,
  onSaved,
}: {
  fullName: string;
  category: string;
  onSaved: () => void;
}) {
  const [n, setN] = useState(fullName);
  const [c, setC] = useState(category);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.saveProfile({ fullName: n.trim(), category: c.trim() || null });
      setMsg("Сохранено.");
      onSaved();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Профиль учителя" subtitle="Подставляется в КСП (учитель)">
      <div className="form-row" style={{ alignItems: "flex-end" }}>
        <div className="form-field" style={{ flex: 2 }}>
          <label className="form-label">ФИО</label>
          <input className="search-input" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label className="form-label">Категория</label>
          <input
            className="search-input"
            value={c}
            onChange={(e) => setC(e.target.value)}
            placeholder="педагог-модератор / эксперт / …"
          />
        </div>
        <div className="form-field">
          <button className="btn btn-primary" disabled={saving || !n.trim()} onClick={save}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
      {msg && <div className="form-hint">{msg}</div>}
    </SettingsSection>
  );
}

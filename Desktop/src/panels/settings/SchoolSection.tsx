import { useState } from "react";
import { api } from "../../services/api";

import { SettingsSection } from "./SettingsSection";

export function SchoolSection({
  id,
  name,
  region,
  onSaved,
}: {
  id: string;
  name: string;
  region: string | null;
  onSaved: () => void;
}) {
  const [n, setN] = useState(name);
  const [r, setR] = useState(region ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.saveSchool({ id, name: n, region: r.trim() || null });
      setMsg("Сохранено.");
      onSaved();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Школа" subtitle="Данные подставляются в титульные листы">
      <div className="form-row">
        <div className="form-field" style={{ flex: 2 }}>
          <label className="form-label">Название школы</label>
          <input className="search-input" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label className="form-label">Регион</label>
          <input className="search-input" value={r} onChange={(e) => setR(e.target.value)} />
        </div>
        <div className="form-field" style={{ alignSelf: "flex-end" }}>
          <button className="btn btn-primary" disabled={saving || !n.trim()} onClick={save}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
      {msg && <div className="form-hint">{msg}</div>}
    </SettingsSection>
  );
}

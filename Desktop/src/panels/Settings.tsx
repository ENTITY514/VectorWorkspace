import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { SchoolState, StaffRole } from "../types";

const STAFF_ROLES: StaffRole[] = ["Director", "DeputyDirector", "MethodHead", "Teacher"];
const ROLE_LABELS: Record<StaffRole, string> = {
  Director: "Директор",
  DeputyDirector: "Завуч",
  MethodHead: "Председатель МО",
  Teacher: "Учитель",
};
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * «Настройки школы» (Фаза 2): школа, штат (temporal integrity), профиль, классы.
 * Ядро владеет истиной — UI отображает агрегаты и отправляет команды.
 */
export function Settings() {
  const [state, setState] = useState<SchoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await api.getSchoolState());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty">Загрузка настроек школы...</div>;
  if (error) return <div className="flash-error">{error}</div>;
  if (!state?.school) {
    return <div className="empty">Школа не создана. Пройдите онбординг.</div>;
  }

  return (
    <div className="settings">
      <SchoolSection
        id={state.school.id}
        name={state.school.name}
        region={state.school.region}
        onSaved={load}
      />
      <StaffSection schoolId={state.school.id} staff={state.staff} onSaved={load} />
      <ProfileSection
        fullName={state.profile?.fullName ?? ""}
        category={state.profile?.category ?? ""}
        onSaved={load}
      />
      <ClassesSection schoolId={state.school.id} classes={state.classes} onSaved={load} />
    </div>
  );
}

function SettingsSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel settings-section">
      <div className="panel-header">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function SchoolSection({
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

function StaffSection({
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

function ProfileSection({
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

function ClassesSection({
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
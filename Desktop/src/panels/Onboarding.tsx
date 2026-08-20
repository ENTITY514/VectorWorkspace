import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { SchoolState } from "../types";

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * Онбординг при первом запуске: школа → профиль учителя → директор → классы.
 * «Смерть умному фронтенду»: UI только собирает ввод, истину устанавливает ядро.
 */
export function Onboarding({ onDone }: { onDone: (state: SchoolState) => void }) {
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Шаг 1 — школа
  const [schoolName, setSchoolName] = useState("");
  const [region, setRegion] = useState("");
  // Шаг 2 — профиль учителя
  const [teacherFullName, setTeacherFullName] = useState("");
  const [teacherCategory, setTeacherCategory] = useState("");
  // Шаг 3 — директор
  const [directorFullName, setDirectorFullName] = useState("");
  // Шаг 4 — классы (опционально)
  const [grade, setGrade] = useState<number>(7);
  const [letter, setLetter] = useState("");
  const [language, setLanguage] = useState<"RU" | "KK">("RU");
  const [classes, setClasses] = useState<{ grade: number; letter: string; language: "RU" | "KK" }[]>([]);

  useEffect(() => {
    api
      .getSchoolState()
      .then((state) => {
        if (state.onboarded) onDone(state);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setChecking(false));
  }, [onDone]);

  if (checking) {
    return <div className="empty">Проверка состояния учреждения...</div>;
  }

  const canNext =
    step === 1 ? schoolName.trim().length > 0
    : step === 2 ? teacherFullName.trim().length > 0
    : step === 3 ? directorFullName.trim().length > 0
    : true;

  const addClass = () => {
    const l = letter.trim().toUpperCase();
    if (!l) {
      setError("Укажите литеру класса (например «А»).");
      return;
    }
    setClasses((prev) => [...prev, { grade, letter: l, language }]);
    setLetter("");
    setError(null);
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const state = await api.onboardSchool({
        schoolName: schoolName.trim(),
        region: region.trim() || null,
        teacherFullName: teacherFullName.trim(),
        teacherCategory: teacherCategory.trim() || null,
        directorFullName: directorFullName.trim(),
      });
      const schoolId = state.school?.id;
      if (schoolId) {
        for (const c of classes) {
          await api.saveClass({ schoolId, grade: c.grade, letter: c.letter, language: c.language });
        }
      }
      onDone(await api.getSchoolState());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboard">
      <div className="onboard-card">
        <h2>Настройка рабочего пространства</h2>
        <p className="onboard-sub">
          Вводится один раз. Данные школы, штата и профиля автоматически подставляются в
          титульные листы КСП и СОР.
        </p>

        <div className="onboard-steps">
          {["Школа", "Профиль учителя", "Директор", "Классы"].map((label, i) => {
            const n = i + 1;
            return (
              <button
                key={label}
                className={`onboard-step ${step === n ? "active" : ""} ${n < step ? "done" : ""}`}
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
              >
                <span className="onboard-step-n">{n}</span> {label}
              </button>
            );
          })}
        </div>

        {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="onboard-body">
          {step === 1 && (
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Название школы *</label>
                <input
                  className="search-input"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="КГУ «Средняя школа № 1»"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Регион</label>
                <input
                  className="search-input"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Костанайская область, г. Костанай"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">ФИО учителя *</label>
                <input
                  className="search-input"
                  value={teacherFullName}
                  onChange={(e) => setTeacherFullName(e.target.value)}
                  placeholder="Иванова Мария Петровна"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Категория / квалификация</label>
                <input
                  className="search-input"
                  value={teacherCategory}
                  onChange={(e) => setTeacherCategory(e.target.value)}
                  placeholder="педагог-модератор / эксперт / …"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">ФИО директора *</label>
                <input
                  className="search-input"
                  value={directorFullName}
                  onChange={(e) => setDirectorFullName(e.target.value)}
                  placeholder="Петров Алексей Иванович"
                />
                <div className="form-hint">
                  Директор утверждает титульные листы. При смене директора подписи старых
                  документов не переписываются.
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="form-grid">
              <div className="form-row">
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
                  <input
                    className="search-input"
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                    placeholder="А"
                    style={{ width: 90 }}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Язык обучения</label>
                  <select
                    className="filter-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "RU" | "KK")}
                  >
                    <option value="RU">Русский</option>
                    <option value="KK">Қазақ</option>
                  </select>
                </div>
                <div className="form-field" style={{ alignSelf: "flex-end" }}>
                  <button type="button" className="btn" onClick={addClass}>+ Добавить</button>
                </div>
              </div>

              {classes.length === 0 ? (
                <div className="empty" style={{ marginTop: 8 }}>
                  Классы можно добавить позже в «Настройках школы».
                </div>
              ) : (
                <table className="data" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Класс</th>
                      <th>Литера</th>
                      <th>Язык</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((c, i) => (
                      <tr key={i}>
                        <td className="cell-main">{c.grade} класс</td>
                        <td>{c.letter}</td>
                        <td>{c.language}</td>
                        <td>
                          <button
                            className="btn btn-sm"
                            onClick={() => setClasses((prev) => prev.filter((_, j) => j !== i))}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="onboard-actions">
          {step > 1 && (
            <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              Назад
            </button>
          )}
          {step < 4 ? (
            <button
              className="btn btn-primary"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              Далее
            </button>
          ) : (
            <button className="btn btn-primary" disabled={saving} onClick={finish}>
              {saving ? "Сохранение…" : "Завершить настройку"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
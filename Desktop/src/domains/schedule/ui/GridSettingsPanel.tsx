import { useEffect, useState } from "react";
import { scheduleApi } from "../api";
import type { ScheduleSettings } from "../../../types";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Сетка расписания: сколько дней и уроков, где проходит граница смен.
 *
 * Раньше размер сетки был зашит литералами в нескольких местах кода и они
 * разошлись: солверу передавалась шестидневка, тогда как данные лежали в
 * пяти днях. Теперь это единственный источник истины.
 */
export function GridSettingsPanel() {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [days, setDays] = useState(5);
  const [periods, setPeriods] = useState(7);
  const [twoShifts, setTwoShifts] = useState(false);
  const [boundary, setBoundary] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    scheduleApi
      .getSettings()
      .then((s) => {
        setSettings(s);
        setDays(s.days);
        setPeriods(s.periods_per_day);
        setTwoShifts(s.shift_boundary_period != null);
        if (s.shift_boundary_period != null) setBoundary(s.shift_boundary_period);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await scheduleApi.setSettings({
        days,
        periods_per_day: periods,
        shift_boundary_period: twoShifts ? boundary : null,
      });
      setSettings(next);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!settings && !error) return <div className="panel">Загрузка настроек...</div>;

  const dirty =
    settings != null &&
    (days !== settings.days ||
      periods !== settings.periods_per_day ||
      (twoShifts ? boundary : null) !== settings.shift_boundary_period);

  return (
    <div className="stack-md">
      <section className="card">
        <h3>Сетка расписания</h3>
        <p className="muted">
          Определяет размер задачи для генератора. Изменение сетки не трогает
          уже сохранённые расписания, но уроки, оказавшиеся за её пределами,
          перестанут отображаться.
        </p>

        <div className="form-grid">
          <label className="form-label" htmlFor="grid-days">Учебных дней в неделе</label>
          <select
            id="grid-days"
            className="input"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[5, 6].map((d) => (
              <option key={d} value={d}>
                {d} ({DAY_NAMES.slice(0, d).join(", ")})
              </option>
            ))}
          </select>

          <label className="form-label" htmlFor="grid-periods">Уроков в день</label>
          <select
            id="grid-periods"
            className="input"
            value={periods}
            onChange={(e) => setPeriods(Number(e.target.value))}
          >
            {[5, 6, 7, 8, 9].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <label className="form-label" htmlFor="grid-shifts">Две смены</label>
          <div>
            <input
              id="grid-shifts"
              type="checkbox"
              checked={twoShifts}
              onChange={(e) => setTwoShifts(e.target.checked)}
            />{" "}
            <span className="muted">
              вторая смена начинается с урока
            </span>{" "}
            <select
              className="input inline"
              value={boundary}
              disabled={!twoShifts}
              onChange={(e) => setBoundary(Number(e.target.value))}
            >
              {Array.from({ length: Math.max(periods - 1, 1) }, (_, i) => i + 1).map((b) => (
                <option key={b} value={b}>{b + 1}-го</option>
              ))}
            </select>
          </div>
        </div>

        <p className="muted">
          Всего слотов на класс: <b>{days * periods}</b>
          {twoShifts && (
            <> · первая смена — уроки 1–{boundary}, вторая — {boundary + 1}–{periods}</>
          )}
        </p>

        <div className="row gap-sm">
          <button className="btn primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
          {saved && !dirty && <span className="muted">Сохранено</span>}
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </section>
    </div>
  );
}

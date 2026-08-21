import { useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * DesignSandbox — изолированная тестовая страница Design System.
 * Все токены и стили определены ТОЛЬКО внутри .ds-sandbox, поэтому
 * глобально ничего не меняется. Тема (light/dark) переключается
 * локально через data-theme на корневом узле песочницы.
 * ------------------------------------------------------------------ */

const SANDBOX_CSS = `
.ds-sandbox {
  /* ---------- Токены (светлая) ---------- */
  --bg-app: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-surface-elevated: #FFFFFF;
  --bg-subtle: #F1F5F9;
  --bg-sidebar: #0F172A;

  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-muted: #94A3B8;
  --text-inverse: #FFFFFF;

  --border-subtle: #E2E8F0;
  --border-strong: #CBD5E1;

  --accent-primary: #4F46E5;
  --accent-hover: #4338CA;
  --accent-subtle: #EEF2FF;

  --status-error-bg: #FEF2F2;
  --status-error-text: #DC2626;
  --status-error-border: #FECACA;

  --status-warning-bg: #FFFBEB;
  --status-warning-text: #D97706;
  --status-warning-border: #FDE68A;

  --status-success-bg: #ECFDF5;
  --status-success-text: #059669;
  --status-success-border: #A7F3D0;

  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-lg: 12px;

  box-sizing: border-box;
  font-family: Inter, "Golos Text", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text-primary);
  background: var(--bg-app);
  padding: 24px 28px 64px;
  min-height: 100vh;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.ds-sandbox *, .ds-sandbox *::before, .ds-sandbox *::after { box-sizing: border-box; }

.ds-sandbox[data-theme="dark"] {
  --bg-app: #0B0F17;
  --bg-surface: #111827;
  --bg-surface-elevated: #1F2937;
  --bg-subtle: #1E293B;
  --bg-sidebar: #080C14;

  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  --text-inverse: #0F172A;

  --border-subtle: #1E293B;
  --border-strong: #334155;

  --accent-primary: #6366F1;
  --accent-hover: #4F46E5;
  --accent-subtle: rgba(99, 102, 241, 0.12);

  --status-error-bg: rgba(239, 68, 68, 0.12);
  --status-error-text: #F87171;
  --status-error-border: rgba(239, 68, 68, 0.25);

  --status-warning-bg: rgba(245, 158, 11, 0.12);
  --status-warning-text: #FBBF24;
  --status-warning-border: rgba(245, 158, 11, 0.25);

  --status-success-bg: rgba(16, 185, 129, 0.12);
  --status-success-text: #34D399;
  --status-success-border: rgba(16, 185, 129, 0.25);
}

/* ---------- Скроллбары ( только в песочнице ) ---------- */
.ds-sandbox ::-webkit-scrollbar { width: 8px; height: 8px; }
.ds-sandbox ::-webkit-scrollbar-track { background: transparent; }
.ds-sandbox ::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 4px;
}
.ds-sandbox ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
.ds-sandbox * { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }

/* ---------- Утилиты ---------- */
.ds-sandbox .ds-num { font-variant-numeric: tabular-nums; }
.ds-sandbox .ds-noselect { user-select: none; }
.ds-sandbox .ds-muted { color: var(--text-muted); }
.ds-sandbox .ds-secondary { color: var(--text-secondary); }

/* ---------- Шапка песочницы ---------- */
.ds-sandbox .ds-topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin-bottom: 8px;
}
.ds-sandbox .ds-topbar h1 { margin: 0; font-size: 22px; }
.ds-sandbox .ds-topbar p { margin: 2px 0 0; color: var(--text-secondary); font-size: 13px; }

/* ---------- Секции ---------- */
.ds-sandbox .ds-section {
  margin-top: 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.ds-sandbox .ds-section-head {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: baseline; gap: 10px;
}
.ds-sandbox .ds-section-head h2 { margin: 0; font-size: 15.5px; }
.ds-sandbox .ds-section-head span { color: var(--text-muted); font-size: 12px; }
.ds-sandbox .ds-section-body { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
.ds-sandbox .ds-grid { display: grid; gap: 16px; }
.ds-sandbox .ds-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ds-sandbox .ds-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ds-sandbox .ds-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1100px) {
  .ds-sandbox .ds-grid-2, .ds-sandbox .ds-grid-3, .ds-sandbox .ds-grid-4 { grid-template-columns: 1fr; }
}
.ds-sandbox .ds-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }

/* ---------- Кнопки ---------- */
.ds-sandbox .ds-btn {
  height: 36px;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: background .15s, border-color .15s, color .15s;
  user-select: none;
}
.ds-sandbox .ds-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.ds-sandbox .ds-btn:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
.ds-sandbox .ds-btn:disabled { opacity: .5; cursor: not-allowed; }
.ds-sandbox .ds-btn--primary {
  background: var(--accent-primary); border-color: var(--accent-primary); color: #fff;
}
.ds-sandbox .ds-btn--primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: #fff; }
.ds-sandbox .ds-btn--secondary { background: transparent; }
.ds-sandbox .ds-btn--ghost { background: transparent; border-color: transparent; }
.ds-sandbox .ds-btn--ghost:hover { background: var(--bg-subtle); color: var(--text-primary); border-color: transparent; }
.ds-sandbox .ds-btn--danger { background: transparent; border-color: var(--status-error-border); color: var(--status-error-text); }
.ds-sandbox .ds-btn--danger:hover { background: var(--status-error-bg); color: var(--status-error-text); border-color: var(--status-error-border); }
.ds-sandbox .ds-btn--sm { height: 32px; padding: 0 10px; font-size: 12px; }
.ds-sandbox .ds-btn--xs { height: 28px; padding: 0 8px; font-size: 12px; }
.ds-sandbox .ds-btn--icon { width: 36px; padding: 0; justify-content: center; }

/* ---------- Инпуты / селекты ---------- */
.ds-sandbox .ds-input, .ds-sandbox .ds-select {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13.5px; font-family: inherit;
  outline: none;
  transition: border-color .15s;
}
.ds-sandbox .ds-input::placeholder { color: var(--text-muted); }
.ds-sandbox .ds-input:focus, .ds-sandbox .ds-select:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
.ds-sandbox .ds-field { display: flex; flex-direction: column; gap: 6px; }
.ds-sandbox .ds-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); user-select: none; }

/* ---------- Segmented / Chips ---------- */
.ds-sandbox .ds-segment {
  display: inline-flex; gap: 1.5; /* gap-1.5 */
  padding: 3px;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
}
.ds-sandbox .ds-segment button {
  height: 30px; min-width: 30px;
  padding: 0 8px;
  border: none; background: transparent;
  border-radius: 6px;
  font-size: 12.5px; font-weight: 500; font-family: inherit;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  transition: background .15s, color .15s;
}
.ds-sandbox .ds-segment button:hover { color: var(--text-primary); }
.ds-sandbox .ds-segment button.active { background: var(--bg-surface); color: var(--accent-primary); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.ds-sandbox .ds-segment button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }

/* ---------- Бейджи / теги / чипы ---------- */
.ds-sandbox .ds-badge {
  display: inline-flex; align-items: center;
  padding: 2px 9px; border-radius: 999px;
  font-size: 11.5px; font-weight: 600; white-space: nowrap;
}
.ds-sandbox .ds-badge--green { background: var(--status-success-bg); color: var(--status-success-text); }
.ds-sandbox .ds-badge--amber { background: var(--status-warning-bg); color: var(--status-warning-text); }
.ds-sandbox .ds-badge--red { background: var(--status-error-bg); color: var(--status-error-text); }
.ds-sandbox .ds-badge--blue { background: var(--accent-subtle); color: var(--accent-primary); }
.ds-sandbox .ds-badge--gray { background: var(--bg-subtle); color: var(--text-secondary); }

.ds-sandbox .ds-tag {
  display: inline-flex; align-items: center;
  background: var(--bg-subtle); color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: 3px 9px; font-size: 11.5px;
}
.ds-sandbox .ds-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--accent-subtle); color: var(--accent-primary);
  border-radius: var(--radius-xs);
  padding: 3px 9px; font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

/* ---------- Карточка ---------- */
.ds-sandbox .ds-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.ds-sandbox .ds-card-header {
  padding: 14px 16px; border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.ds-sandbox .ds-card-header h3 { margin: 0; font-size: 14.5px; }
.ds-sandbox .ds-card-body { padding: 16px; }

/* ---------- Прогресс ---------- */
.ds-sandbox .ds-progress {
  height: 6px; background: var(--bg-subtle);
  border-radius: 999px; overflow: hidden; min-width: 90px;
}
.ds-sandbox .ds-progress > i {
  display: block; height: 100%; background: var(--accent-primary); border-radius: 999px;
}
.ds-sandbox .ds-qprog {
  display: inline-flex; flex-direction: column; align-items: center; gap: 4px;
  border: 1px solid var(--border-subtle); background: var(--bg-surface);
  border-radius: var(--radius-xs); padding: 6px 10px; font-size: 11.5px;
}
.ds-sandbox .ds-qprog b { font-weight: 600; }

/* ---------- Таблица КТП ---------- */
.ds-sandbox .ds-table-wrap {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: auto;
  max-height: 380px;
}
.ds-sandbox .ds-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ds-sandbox .ds-table thead th {
  position: sticky; top: 0; z-index: 10;
  text-align: left;
  font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px;
  color: var(--text-muted);
  padding: 10px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-strong);
  user-select: none;
}
.ds-sandbox .ds-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  vertical-align: top;
}
.ds-sandbox .ds-table td:last-child { border-right: none; }
.ds-sandbox .ds-table tbody tr:hover td { background: var(--bg-subtle); }
.ds-sandbox .ds-table tbody tr:focus-within td { background: var(--accent-subtle); }
.ds-sandbox .ds-cell-main { font-weight: 600; }
.ds-sandbox .ds-cell-sub { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
.ds-sandbox .ds-code { font-variant-numeric: tabular-nums; color: var(--accent-primary); font-weight: 700; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.ds-sandbox .ds-row-quarter td {
  background: var(--bg-subtle);
  border-left: 4px solid var(--accent-primary);
  font-weight: 600;
  cursor: default;
}
.ds-sandbox .ds-row-quarter:hover td { background: var(--bg-subtle); }

/* ---------- Alert-баннер (валидация часов) ---------- */
.ds-sandbox .ds-alert {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 14px; border-radius: var(--radius-sm);
  font-size: 13px; border: 1px solid transparent;
}
.ds-sandbox .ds-alert--error { background: var(--status-error-bg); border-color: var(--status-error-border); color: var(--status-error-text); }
.ds-sandbox .ds-alert--warning { background: var(--status-warning-bg); border-color: var(--status-warning-border); color: var(--status-warning-text); }
.ds-sandbox .ds-alert--success { background: var(--status-success-bg); border-color: var(--status-success-border); color: var(--status-success-text); }
.ds-sandbox .ds-alert .ds-alert-summary { font-weight: 600; }
.ds-sandbox .ds-alert .ds-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ds-sandbox .ds-alert details { margin-top: 2px; }
.ds-sandbox .ds-alert summary { cursor: pointer; user-select: none; font-weight: 600; }
.ds-sandbox .ds-qdiff { display: inline-flex; background: var(--status-error-bg); color: var(--status-error-text); border: 1px solid var(--status-error-border); border-radius: 999px; padding: 2px 9px; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }

/* ---------- Titlebar (Tauri drag-region) ---------- */
.ds-sandbox .ds-titlebar {
  display: flex; align-items: center; gap: 12px;
  height: 40px; padding: 0 12px;
  background: var(--bg-sidebar); color: #fff;
  border-radius: var(--radius-sm);
  user-select: none;
}
.ds-sandbox .ds-titlebar [data-tauri-drag-region] { flex: 1; height: 100%; display: flex; align-items: center; padding: 0 8px; font-size: 12.5px; color: #c7d0e0; }
.ds-sandbox .ds-titlebar .ds-no-drag { display: inline-flex; gap: 6px; }
.ds-sandbox .ds-titlebar .ds-no-drag button {
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: #c7d0e0; cursor: pointer; font-size: 13px;
}
.ds-sandbox .ds-titlebar .ds-no-drag button:hover { background: rgba(255,255,255,.1); color: #fff; }
.ds-sandbox .ds-titlebar .ds-no-drag button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }

/* ---------- Toast (демо) ---------- */
.ds-sandbox .ds-toast {
  position: sticky; bottom: 8px; align-self: flex-end;
  background: var(--accent-primary); color: #fff;
  padding: 10px 16px; border-radius: var(--radius-sm); font-size: 13px;
  box-shadow: 0 6px 20px rgba(0,0,0,.25);
}

/* ---------- Поверхности (демо элевации) ---------- */
.ds-sandbox .ds-surface { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 16px; }
.ds-sandbox .ds-surface--elevated { background: var(--bg-surface-elevated); border: 1px solid var(--border-strong); }
.ds-sandbox .ds-surface--subtle { background: var(--bg-subtle); }
`;

/* ----------------------------- Данные ----------------------------- */
const KTP_ROWS: ReactNode[] = [
  <>
    <tr className="ds-row-quarter">
      <td colSpan={5}>1-я четверть · 36 ч.</td>
    </tr>
    {[
      ["1", "04.09", "Натуральные числа. Десятичная запись", "Урок", "8.1.1.1", "1"],
      ["2", "06.09", "Сложение и вычитание натуральных чисел", "Урок", "8.1.1.2", "1"],
      ["3", "09.09", "Контрольная работа №1", "СОЧ", "8.1.2.1", "1"],
    ].map(([n, d, t, k, c, h]) => (
      <tr key={n}>
        <td className="ds-num">{n}</td>
        <td className="ds-num">{d}</td>
        <td><div className="ds-cell-main">{t}</div></td>
        <td><span className="ds-badge ds-badge--blue">{k}</span></td>
        <td><span className="ds-code">{c}</span></td>
        <td className="ds-num">{h}</td>
      </tr>
    ))}
  </>,
  <>
    <tr className="ds-row-quarter">
      <td colSpan={5}>2-я четверть · 32 ч.</td>
    </tr>
    {[
      ["4", "05.11", "Умножение натуральных чисел", "Урок", "8.1.3.1", "1"],
      ["5", "08.11", "Деление. Признаки делимости", "Урок", "8.1.3.2", "1"],
    ].map(([n, d, t, k, c, h]) => (
      <tr key={n}>
        <td className="ds-num">{n}</td>
        <td className="ds-num">{d}</td>
        <td><div className="ds-cell-main">{t}</div></td>
        <td><span className="ds-badge ds-badge--blue">{k}</span></td>
        <td><span className="ds-code">{c}</span></td>
        <td className="ds-num">{h}</td>
      </tr>
    ))}
  </>,
];

export function DesignSandbox() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [grade, setGrade] = useState<string>("5");
  const [showToast, setShowToast] = useState(false);

  return (
    <div className="ds-sandbox" data-theme={theme}>
      <style>{SANDBOX_CSS}</style>

      <div className="ds-topbar ds-noselect">
        <div>
          <h1>Design System Sandbox</h1>
          <p>Изолированная тестовая страница — стили не применяются глобально</p>
        </div>
        <div className="ds-segment" role="group" aria-label="Тема">
          <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
            ☀ Light
          </button>
          <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
            ☾ Dark
          </button>
        </div>
      </div>

      {/* 1. Поверхности и элевация */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>1. Поверхности и элевация</h2>
          <span>токены фона, глубина через яркость/бордер</span>
        </header>
        <div className="ds-section-body ds-grid ds-grid-3">
          <div className="ds-surface">Фон приложения / контейнер (--bg-surface)</div>
          <div className="ds-surface ds-surface--subtle">Субтл слой — ховер, чипы (--bg-subtle)</div>
          <div className="ds-surface ds-surface--elevated">Выпадающее / модалка (--bg-surface-elevated + бордер)</div>
        </div>
      </section>

      {/* 2. Типографика + tabular-nums */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>2. Табличные цифры (tabular-nums)</h2>
          <span>коды целей 8.3.1.1, даты, часы не смещаются</span>
        </header>
        <div className="ds-section-body ds-grid ds-grid-2">
          <div className="ds-surface">
            <div className="ds-secondary" style={{ marginBottom: 6 }}>Без tabular-nums</div>
            <div style={{ fontVariantNumeric: "normal" }} className="ds-num">8.3.1.1 · 8.3.1.11 · 8.3.1.111</div>
          </div>
          <div className="ds-surface">
            <div className="ds-secondary" style={{ marginBottom: 6 }}>С tabular-nums</div>
            <div className="ds-num">8.3.1.1 · 8.3.1.11 · 8.3.1.111</div>
          </div>
        </div>
      </section>

      {/* 3. Кнопки */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>3. Кнопки и Toolbar</h2>
          <span>Primary / Secondary / Ghost / Danger + размеры</span>
        </header>
        <div className="ds-section-body">
          <div className="ds-row">
            <button className="ds-btn ds-btn--primary">Сохранить</button>
            <button className="ds-btn ds-btn--secondary">Авторасчёт дат</button>
            <button className="ds-btn ds-btn--secondary">В шаблон</button>
            <button className="ds-btn ds-btn--ghost">← К списку</button>
            <button className="ds-btn ds-btn--danger">Удалить план</button>
          </div>
          <div className="ds-row">
            <button className="ds-btn ds-btn--primary ds-btn--sm">Primary sm</button>
            <button className="ds-btn ds-btn--secondary ds-btn--sm">Secondary sm</button>
            <button className="ds-btn ds-btn--icon ds-btn--ghost" aria-label="Закрыть">✕</button>
            <button className="ds-btn ds-btn--icon ds-btn--ghost" aria-label="Удалить">🗑</button>
            <button className="ds-btn" disabled>Disabled</button>
            <button className="ds-btn ds-btn--primary" disabled>Disabled primary</button>
          </div>
        </div>
      </section>

      {/* 4. Инпуты и селекты */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>4. Поля ввода</h2>
          <span>h-36px, фокус-кольцо 2px</span>
        </header>
        <div className="ds-section-body ds-grid ds-grid-3">
          <div className="ds-field">
            <label className="ds-label">Название предмета</label>
            <input className="ds-input" placeholder="Алгебра и начала анализа" />
          </div>
          <div className="ds-field">
            <label className="ds-label">Учебный год</label>
            <select className="ds-select" defaultValue="2025">
              <option>2025</option>
              <option>2026</option>
            </select>
          </div>
          <div className="ds-field">
            <label className="ds-label">Кол-во часов</label>
            <input className="ds-input ds-num" type="number" defaultValue={68} />
          </div>
        </div>
      </section>

      {/* 5. Поиск и фильтр классов */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>5. Поиск и фильтр классов</h2>
          <span>одна строка поиска + segmented chips</span>
        </header>
        <div className="ds-section-body">
          <input className="ds-input" style={{ maxWidth: 360 }} placeholder="Поиск по ТУП, целям, темам…" />
          <div className="ds-row">
            <span className="ds-label" style={{ alignSelf: "center" }}>Класс:</span>
            <div className="ds-segment" role="group" aria-label="Класс">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].map((g) => (
                <button key={g} className={grade === g ? "active" : ""} onClick={() => setGrade(g)}>
                  {g}
                </button>
              ))}
            </div>
            <span className="ds-muted">Выбран: {grade} кл.</span>
          </div>
        </div>
      </section>

      {/* 6. Бейджи / теги / чипы */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>6. Бейджи, теги, чипы</h2>
          <span>radius 6px / 999px</span>
        </header>
        <div className="ds-section-body ds-row">
          <span className="ds-badge ds-badge--green">Выполнено</span>
          <span className="ds-badge ds-badge--amber">В работе</span>
          <span className="ds-badge ds-badge--red">Ошибка</span>
          <span className="ds-badge ds-badge--blue">ТУП</span>
          <span className="ds-badge ds-badge--gray">Черновик</span>
          <span className="ds-tag">математика</span>
          <span className="ds-tag">КСП</span>
          <span className="ds-chip">8.3.1.1</span>
          <span className="ds-chip">8.3.1.2</span>
          <span className="ds-chip ds-num">+15 ч.</span>
        </div>
      </section>

      {/* 7. Таблица КТП */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>7. Таблица данных (КТП)</h2>
          <span>sticky header, акцентные разделители четвертей</span>
        </header>
        <div className="ds-section-body">
          <div className="ds-row">
            <div className="ds-qprog"><b className="ds-num">1-я: 100%</b><div className="ds-progress"><i style={{ width: "100%" }} /></div></div>
            <div className="ds-qprog"><b className="ds-num">2-я: 100%</b><div className="ds-progress"><i style={{ width: "100%" }} /></div></div>
            <div className="ds-qprog"><b className="ds-num">3-я: 90%</b><div className="ds-progress"><i style={{ width: "90%" }} /></div></div>
            <div className="ds-qprog"><b className="ds-num">4-я: 0%</b><div className="ds-progress"><i style={{ width: "0%" }} /></div></div>
          </div>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>№</th>
                  <th style={{ width: 110 }}>Дата</th>
                  <th>Тема урока</th>
                  <th style={{ width: 110 }}>Тип</th>
                  <th style={{ width: 120 }}>Цели</th>
                  <th style={{ width: 60 }}>Ч</th>
                </tr>
              </thead>
              <tbody>{KTP_ROWS}</tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 8. Alert-баннер валидации */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>8. Валидация расхождения часов</h2>
          <span>компактный баннер, без красного полотна</span>
        </header>
        <div className="ds-section-body">
          <div className="ds-alert ds-alert--error">
            <span>⚠️</span>
            <div style={{ flex: 1 }}>
              <div className="ds-alert-summary">
                Не сходится норма: <span className="ds-num">68 ч.</span> / Фактически:{" "}
                <span className="ds-num">109 ч.</span> (<span className="ds-num">+41 ч.</span>)
              </div>
              <div className="ds-badges">
                <span className="ds-qdiff">1-я четв.: +15 ч.</span>
                <span className="ds-qdiff">2-я четв.: +8 ч.</span>
                <span className="ds-qdiff">3-я четв.: +17 ч.</span>
                <span className="ds-qdiff">4-я четв.: +1 ч.</span>
              </div>
              <details>
                <summary>Подробнее по четвертям ▾</summary>
                <div style={{ marginTop: 8 }} className="ds-secondary">
                  1-я четверть: норма 36 / факт 51 (+15). 2-я четверть: норма 32 / факт 40 (+8).
                  3-я четверть: норма 34 / факт 51 (+17). 4-я четверть: норма 11 / факт 12 (+1).
                </div>
              </details>
            </div>
          </div>
          <div className="ds-alert ds-alert--warning" style={{ marginTop: 12 }}>
            <span>⚠️</span>
            <div className="ds-alert-summary">Норма на 3-ю четверть превышена на 50%.</div>
          </div>
          <div className="ds-alert ds-alert--success" style={{ marginTop: 12 }}>
            <span>✓</span>
            <div className="ds-alert-summary">Все даты рассчитаны автоматически.</div>
          </div>
        </div>
      </section>

      {/* 9. Titlebar (Tauri) */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>9. Кастомный фрейм (Tauri)</h2>
          <span>drag-region + no-drag кнопки</span>
        </header>
        <div className="ds-section-body">
          <div className="ds-titlebar ds-noselect">
            <span data-tauri-drag-region>VectorWorkspace — КТП · Алгебра 5 кл.</span>
            <div className="ds-no-drag">
              <button title="Minimize">—</button>
              <button title="Maximize">▢</button>
              <button title="Close">✕</button>
            </div>
          </div>
          <p className="ds-muted" style={{ marginTop: 8, fontSize: 12 }}>
            Перетаскивание окна работает по центральной зоне; кнопки остаются кликабельными.
          </p>
        </div>
      </section>

      {/* 10. Карточка */}
      <section className="ds-section">
        <header className="ds-section-head">
          <h2>10. Карточка с заголовком</h2>
          <span>header с нижним разделителем</span>
        </header>
        <div className="ds-section-body ds-grid ds-grid-2">
          <div className="ds-card">
            <div className="ds-card-header">
              <h3>ТУП · Математика 5 кл.</h3>
              <span className="ds-badge ds-badge--green">Активен</span>
            </div>
            <div className="ds-card-body ds-secondary">
              68 часов в год · 4 четверти · цели обновлены 21.08.2026.
            </div>
          </div>
          <div className="ds-card">
            <div className="ds-card-header">
              <h3>Сохранённый план</h3>
              <button className="ds-btn ds-btn--ghost ds-btn--xs">Открыть</button>
            </div>
            <div className="ds-card-body ds-secondary">
              Последнее сохранение: 20.08.2026, 14:32.
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 16 }} />
      {showToast && (
        <div className="ds-toast" onClick={() => setShowToast(false)}>
          Готово! Нажмите, чтобы скрыть.
        </div>
      )}
      <button className="ds-btn ds-btn--primary" style={{ marginTop: 12 }} onClick={() => setShowToast(true)}>
        Показать toast
      </button>
    </div>
  );
}

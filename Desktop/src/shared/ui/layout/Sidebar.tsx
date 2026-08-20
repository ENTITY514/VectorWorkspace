
import type { View } from "../../../types";

export const nav: { id: View; icon: string; label: string }[] = [
  { id: "today", icon: "◧", label: "Сегодня" },
  { id: "tup", icon: "◫", label: "ТУП" },
  { id: "ktp", icon: "▤", label: "КТП" },
  { id: "lessons", icon: "✎", label: "Уроки (КСП)" },
  { id: "library", icon: "☰", label: "Библиотека заданий" },
  { id: "sor", icon: "✓", label: "СОР / СОЧ" },
  { id: "analytics", icon: "◔", label: "Аналитика" },
  { id: "students", icon: "☺", label: "Ученики" },
  { id: "settings", icon: "⚙", label: "Настройки" },
];

export function Sidebar({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>VectorWorkspace</h1>
        <p>Учитель математики · КСП/СОР</p>
      </div>
      <nav className="sidebar-nav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? "active" : ""}`}
            onClick={() => onSelect(n.id)}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">Локально · вектор рабочего пространства</div>
    </aside>
  );
}

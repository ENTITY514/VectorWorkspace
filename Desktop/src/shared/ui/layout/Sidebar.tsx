import type { View } from "../../../types";
import { useTheme } from "./useTheme";

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
  { id: "schedule", icon: "▦", label: "Расписание" },
  { id: "ds", icon: "◈", label: "Дизайн (тест)" },
];

export function Sidebar({
  view,
  onSelect,
  collapsed,
  onToggle,
}: {
  view: View;
  onSelect: (v: View) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  // Тема всё ещё читается здесь, чтобы сайдбар реагировал на смену темы
  // (например, для активного пункта), но переключатель вынесен в заголовок.
  useTheme();

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="sidebar-brand"
        onClick={onToggle}
        title={collapsed ? "Развернуть меню" : "Свернуть меню"}
        aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        aria-expanded={!collapsed}
      >
        <span className="sidebar-wordmark">VectorWorkspace</span>
        <span className={`sidebar-chevron ${collapsed ? "collapsed" : ""}`} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <nav className="sidebar-nav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? "active" : ""}`}
            onClick={() => onSelect(n.id)}
            title={collapsed ? n.label : undefined}
            aria-label={collapsed ? n.label : undefined}
          >
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span>Локально · вектор рабочего пространства</span>
      </div>
    </aside>
  );
}

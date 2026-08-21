import type { View } from "../../../types";
import { useTheme } from "./useTheme";
import { UserMenu, type UserMenuItem } from "./UserMenu";

/* Маленькие SVG-иконки (без эмодзи), переиспользуемые в меню и тулбаре. */
const Icon = {
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" fill="currentColor" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  login: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 12h11M17 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 12h11M20 8l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  sun: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  moon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" fill="currentColor" />
    </svg>
  ),
  menu: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

export function AppHeader({
  title,
  subtitle,
  onNavigate,
}: {
  title: string;
  subtitle?: string;
  onNavigate: (v: View) => void;
}) {
  const [theme, setTheme] = useTheme();

  // Базовый состав меню пользователя. Новые пункты добавляются сюда
  // и связываются через onSelect — компонент UserMenu менять не нужно.
  const menuItems: UserMenuItem[] = [
    { id: "profile", label: "Профиль", icon: Icon.profile, onSelect: () => {} },
    { id: "settings", label: "Настройки", icon: Icon.settings, onSelect: () => onNavigate("settings") },
    { id: "login", label: "Вход", icon: Icon.login, onSelect: () => {} },
    { id: "logout", label: "Выход", icon: Icon.logout, onSelect: () => {} },
  ];

  return (
    <header className="app-header">
      <div className="app-header-left">
        <div className="app-header-titles">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="app-header-right">
        <button
          type="button"
          className="app-header-btn"
          aria-label="Переключить тему"
          title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? Icon.moon : Icon.sun}
        </button>
        <UserMenu items={menuItems} />
      </div>
    </header>
  );
}

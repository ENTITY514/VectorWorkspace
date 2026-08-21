import { useEffect, useRef, useState, type ReactNode } from "react";

/* Расширяемый шаблон меню пользователя.
 * Состав пунктов задаётся массивом UserMenuItem — новые действия
 * (профиль, настройки, вход, выход и др.) добавляются и связываются
 * через onSelect без изменения самого компонента. */

export interface UserMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export function UserMenu({ items }: { items: UserMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню пользователя"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="4" fill="currentColor" />
          <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="user-menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              className="user-menu-item"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon && <span className="user-menu-icon">{it.icon}</span>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

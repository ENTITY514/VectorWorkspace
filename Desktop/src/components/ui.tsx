import type { ReactNode } from "react";

export function Badge({
  color,
  children,
}: {
  color: "green" | "amber" | "blue" | "gray" | "red";
  children: ReactNode;
}) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

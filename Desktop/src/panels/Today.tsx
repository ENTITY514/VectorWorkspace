import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { HealthReport } from "../types";
import { Panel, Stat } from "../components/ui";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

export function Today() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayStr();

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Статус ядра" value={error ? "ошибка" : health?.status ?? "…"} tone={error ? "red" : "green"} />
        <Stat label="Схема БД" value={health ? `v${health.schemaVersion}` : "—"} />
        <Stat label="Версия приложения" value={health?.appVersion ?? "—"} tone="blue" />
        <Stat label="Уроков сегодня" value="0" tone="amber" />
      </div>

      <div className="grid-layout">
        <Panel title="План на сегодня" subtitle={fmtDate(today)}>
          <div className="panel-body">
            {error ? (
              <div className="flash-error">Ядро недоступно: {error}</div>
            ) : (
              <div className="empty">Событий на сегодня нет — контур календаря КТП будет подключён в Фазе 4.</div>
            )}
          </div>
        </Panel>

        <Panel title="Состояние ядра" subtitle="Нормативный базис">
          <div className="panel-body">
            {health ? (
              <div className="kv">
                <div><span className="muted">Статус</span><b>{health.status}</b></div>
                <div><span className="muted">Версия приложения</span><b>{health.appVersion}</b></div>
                <div><span className="muted">Версия схемы БД</span><b>{health.schemaVersion}</b></div>
              </div>
            ) : (
              <div className="empty">Ожидание ответа ядра…</div>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

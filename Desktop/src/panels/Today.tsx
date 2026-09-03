import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { scheduleApi } from "../domains/schedule/api";
import type { HealthReport, ScheduleState } from "../types";
import { Panel } from "../components/ui";
import { Stat } from "../shared/ui/Stat";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Индекс дня в сетке расписания: понедельник — 0, воскресенье — 6. */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

export function Today() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [state, setState] = useState<ScheduleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayStr();
  const dayIdx = todayIndex();

  useEffect(() => {
    api.getHealth().then(setHealth).catch((e) => setError(String(e)));
    // Расписание может быть не заполнено — это не ошибка ядра.
    scheduleApi.getState().then(setState).catch(() => setState(null));
  }, []);

  /// Уроки сегодняшнего дня, сгруппированные по номеру урока.
  const todayLessons = useMemo(() => {
    if (!state) return [];
    const byPeriod = new Map<number, ScheduleState["slots"]>();
    for (const s of state.slots) {
      if (s.day !== dayIdx) continue;
      const list = byPeriod.get(s.period) ?? [];
      list.push(s);
      byPeriod.set(s.period, list);
    }
    return Array.from(byPeriod.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([period, slots]) => ({ period, slots }));
  }, [state, dayIdx]);

  const totalToday = todayLessons.reduce((n, g) => n + g.slots.length, 0);
  const isWeekend = dayIdx >= 5;

  const nameOf = (list: { id: string; name?: string; full_name?: string }[], id: string) =>
    list.find((x) => x.id === id)?.name ?? list.find((x) => x.id === id)?.full_name ?? id;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Статус ядра" value={error ? "ошибка" : health?.status ?? "…"} tone={error ? "red" : "green"} />
        <Stat label="Схема БД" value={health ? `v${health.schemaVersion}` : "—"} />
        <Stat label="Версия приложения" value={health?.appVersion ?? "—"} tone="blue" />
        <Stat label="Уроков сегодня" value={String(totalToday)} tone={totalToday > 0 ? "amber" : undefined} />
      </div>

      <div className="grid-layout">
        <Panel title="Расписание на сегодня" subtitle={`${fmtDate(today)} · ${DAY_NAMES[dayIdx]}`}>
          <div className="panel-body">
            {error ? (
              <div className="flash-error">Ядро недоступно: {error}</div>
            ) : !state ? (
              <div className="empty">Загрузка расписания…</div>
            ) : isWeekend && totalToday === 0 ? (
              <div className="empty">Выходной — уроков нет.</div>
            ) : totalToday === 0 ? (
              <div className="empty">
                На этот день уроков нет. Возможно, расписание ещё не
                сгенерировано или активен другой вариант.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Урок</th>
                      <th>Класс</th>
                      <th>Предмет</th>
                      <th>Учитель</th>
                      <th>Кабинет</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayLessons.map(({ period, slots }) =>
                      slots.map((s, i) => (
                        <tr key={s.id}>
                          {i === 0 && (
                            <th rowSpan={slots.length} style={{ textAlign: "center" }}>
                              {period + 1}
                            </th>
                          )}
                          <td><b>{s.class_id}</b></td>
                          <td>{nameOf(state.subjects, s.subject_id)}</td>
                          <td>{nameOf(state.teachers, s.teacher_id)}</td>
                          <td className="muted">
                            {s.room_id ? nameOf(state.rooms, s.room_id) : "— (надомное)"}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
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
                {state && (
                  <>
                    <div><span className="muted">Классов</span><b>{state.classes.length}</b></div>
                    <div><span className="muted">Учителей</span><b>{state.teachers.length}</b></div>
                    <div><span className="muted">Уроков в расписании</span><b>{state.slots.length}</b></div>
                  </>
                )}
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

import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "../domains/schedule/api";
import type { ScheduleAnalytics, ScheduleVariant } from "../types";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Сводка по расписанию: окна, СанПиН, нагрузка, кабинеты, покрытие плана.
 *
 * Все величины приходят из ядра одним запросом. Считать их в интерфейсе
 * нельзя: те же метрики используют автотесты и проверка генерации, а вторая
 * реализация неизбежно разошлась бы с первой.
 */
export function Analytics() {
  const [data, setData] = useState<ScheduleAnalytics | null>(null);
  const [variants, setVariants] = useState<ScheduleVariant[]>([]);
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (vid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [a, vs] = await Promise.all([
        scheduleApi.analytics(vid),
        scheduleApi.listVariants().catch(() => [] as ScheduleVariant[]),
      ]);
      setData(a);
      setVariants(vs);
      setVariantId(a.variant_id);
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="panel">Считаю показатели...</div>;
  if (error) return <div className="panel error">{error}</div>;
  if (!data) return <div className="panel">Нет данных</div>;

  const empty = data.total_lessons === 0;

  return (
    <div className="stack-md" style={{ padding: 20 }}>
      <header className="row gap-sm" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Аналитика расписания</h1>
        <div className="row gap-sm">
          {variants.length > 0 && (
            <select
              className="input inline"
              value={variantId ?? ""}
              onChange={(e) => { setVariantId(e.target.value); load(e.target.value); }}
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.academic_year}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={() => load(variantId)}>Обновить</button>
        </div>
      </header>

      {empty ? (
        <section className="card">
          <h3>Расписание пусто</h3>
          <p className="muted">
            В выбранном варианте нет ни одного урока. Сгенерируйте расписание
            или выберите другой вариант — показатели появятся сразу.
          </p>
        </section>
      ) : (
        <>
          <KeyFigures data={data} />
          <SanPinSection data={data} />
          <Heatmap data={data} />
          <ClassesTable data={data} />
          <TeachersTable data={data} />
          <RoomsTable data={data} />
          <IssuesSection data={data} />
        </>
      )}
    </div>
  );
}

/** Верхняя строка: то, на что смотрят в первую очередь. */
function KeyFigures({ data }: { data: ScheduleAnalytics }) {
  const conflictCount = data.conflicts.length;
  return (
    <section className="card">
      <h3>Ключевые показатели</h3>
      <div className="stat-row">
        <Stat label="Уроков всего" value={data.total_lessons} />
        <Stat
          label="Окна у учеников"
          value={data.student_windows}
          tone={data.student_windows === 0 ? "good" : "bad"}
          hint="Норма — ноль: ученики не должны ждать между уроками"
        />
        <Stat
          label="Окна у учителей"
          value={data.teacher_windows}
          tone={data.teacher_windows === 0 ? "good" : data.teacher_windows > 40 ? "warn" : undefined}
          hint="Полностью убрать обычно нельзя, но стоит держать низкими"
        />
        <Stat
          label="Накладки"
          value={conflictCount}
          tone={conflictCount === 0 ? "good" : "bad"}
          hint="Один учитель или кабинет заняты дважды в одном слоте"
        />
        <Stat
          label="Расхождений с планом"
          value={data.coverage_issues.length}
          tone={data.coverage_issues.length === 0 ? "good" : "warn"}
          hint="Предметы, у которых часов в расписании не столько, сколько в нагрузке"
        />
        {data.lessons_without_room > 0 && (
          <Stat
            label="Без кабинета"
            value={data.lessons_without_room}
            hint="Надомное обучение — это нормально"
          />
        )}
      </div>
    </section>
  );
}

/** Санитарные правила: трудные предметы и распределение нагрузки по дням. */
function SanPinSection({ data }: { data: ScheduleAnalytics }) {
  const worstDays = useMemo(() => {
    const days = data.grid.days;
    const totals = Array.from({ length: days }, (_, d) =>
      data.classes.reduce((sum, c) => sum + (c.difficulty_per_day[d] ?? 0), 0),
    );
    const max = Math.max(...totals, 1);
    return totals.map((t) => ({ total: t, share: t / max }));
  }, [data]);

  return (
    <section className="card">
      <h3>СанПиН</h3>
      <p className="muted">
        Пик умственной работоспособности приходится на 2–4 уроки: предметы
        высокой трудности (9–11 баллов) должны стоять там.
      </p>
      <div className="stat-row">
        <Stat
          label="Трудные вне пика"
          value={data.sanpin_hard_outside_peak}
          tone={data.sanpin_hard_outside_peak > 0 ? "warn" : "good"}
        />
        <Stat
          label="Трудные на последних уроках"
          value={data.sanpin_hard_at_late_periods}
          tone={data.sanpin_hard_at_late_periods > 0 ? "bad" : "good"}
        />
      </div>

      <h4 style={{ marginBottom: 4 }}>Кривая нагрузки по дням</h4>
      <p className="muted">
        Суммарный балл трудности по всей школе. По СанПиН кривая должна расти
        к вторнику–четвергу и снижаться к пятнице.
      </p>
      <div className="stack-sm">
        {worstDays.map((d, i) => (
          <div key={i} className="row gap-sm">
            <span style={{ width: 34 }}>{DAY_NAMES[i]}</span>
            <div className="meter" style={{ flex: 1 }}>
              <span style={{ width: `${Math.round(d.share * 100)}%` }} />
            </div>
            <span className="muted" style={{ width: 60, textAlign: "right" }}>{d.total}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Занятость по слотам — сразу видно перекос к первым урокам. */
function Heatmap({ data }: { data: ScheduleAnalytics }) {
  const max = Math.max(1, ...data.heatmap.flat());
  return (
    <section className="card">
      <h3>Занятость по урокам</h3>
      <p className="muted">
        Сколько занятий идёт одновременно. Резкий спад к концу дня — норма,
        провал в середине означает окна.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="table centered">
          <thead>
            <tr>
              <th />
              {Array.from({ length: data.grid.periods_per_day }, (_, p) => (
                <th key={p}>{p + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.heatmap.map((row, d) => (
              <tr key={d}>
                <th style={{ textAlign: "left" }}>{DAY_NAMES[d]}</th>
                {row.map((n, p) => (
                  <td
                    key={p}
                    title={`${DAY_NAMES[d]}, урок ${p + 1}: ${n}`}
                    style={{
                      background: n === 0 ? "transparent"
                        : `color-mix(in srgb, var(--accent-primary) ${Math.round((n / max) * 70)}%, transparent)`,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {n || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClassesTable({ data }: { data: ScheduleAnalytics }) {
  const withWindows = data.classes.filter((c) => c.windows > 0);
  return (
    <section className="card">
      <h3>Классы ({data.classes.length})</h3>
      {withWindows.length === 0 ? (
        <p className="muted">Окон у учеников нет ни в одном классе.</p>
      ) : (
        <p className="muted">
          Окна есть у {withWindows.length} классов — это нарушение: ученики не
          должны ждать между уроками.
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Класс</th>
              <th>Тип</th>
              <th>Уроков</th>
              <th>Окна</th>
              {Array.from({ length: data.grid.days }, (_, d) => (
                <th key={d}>{DAY_NAMES[d]}</th>
              ))}
              <th>Трудные поздно</th>
            </tr>
          </thead>
          <tbody>
            {data.classes.map((c) => (
              <tr key={c.class_id}>
                <td><b>{c.class_id}</b></td>
                <td className="muted">{classTypeLabel(c.class_type)}</td>
                <td>{c.lessons}</td>
                <td className={c.windows > 0 ? "cell-bad" : undefined}>{c.windows}</td>
                {Array.from({ length: data.grid.days }, (_, d) => (
                  <td key={d}>{c.per_day[d] ?? 0}</td>
                ))}
                <td className={c.hard_at_late_periods > 0 ? "cell-warn" : undefined}>
                  {c.hard_at_late_periods}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeachersTable({ data }: { data: ScheduleAnalytics }) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const rows = onlyProblems
    ? data.teachers.filter((t) => t.windows > 0 || t.lessons !== t.planned_hours)
    : data.teachers;
  const noRoom = data.teachers.filter((t) => !t.base_room_id).length;

  return (
    <section className="card">
      <div className="row gap-sm" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Учителя ({data.teachers.length})</h3>
        <label className="muted">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
          />{" "}
          только с замечаниями
        </label>
      </div>
      {noRoom > 0 && (
        <p className="muted">
          У {noRoom} учителей не задан закреплённый кабинет. Такие уроки можно
          поставить в любой свободный кабинет, из-за чего расчёт идёт дольше.
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Учитель</th>
              <th>Уроков</th>
              <th>По плану</th>
              <th>Окна</th>
              <th>Дней</th>
              <th>Макс/день</th>
              <th>Кабинет</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const mismatch = t.lessons !== t.planned_hours;
              return (
                <tr key={t.teacher_id}>
                  <td>{t.full_name}</td>
                  <td>{t.lessons}</td>
                  <td className={mismatch ? "cell-warn" : undefined} title={mismatch ? "Расходится с учебным планом" : undefined}>
                    {t.planned_hours}
                  </td>
                  <td className={t.windows > 3 ? "cell-warn" : undefined}>{t.windows}</td>
                  <td>{t.working_days}</td>
                  <td>{t.max_lessons_per_day}</td>
                  <td className="muted">{t.base_room_id ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoomsTable({ data }: { data: ScheduleAnalytics }) {
  const used = data.rooms.filter((r) => r.lessons > 0);
  return (
    <section className="card">
      <h3>Кабинеты</h3>
      <p className="muted">
        Задействовано {used.length} из {data.rooms.length}. Доля — от общего
        числа слотов недели ({data.grid.days * data.grid.periods_per_day}).
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Кабинет</th>
              <th>Тип</th>
              <th>Занятий</th>
              <th style={{ width: "40%" }}>Загрузка</th>
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((r) => (
              <tr key={r.room_id}>
                <td>{r.name}</td>
                <td className="muted">{r.room_type}</td>
                <td>{r.lessons}</td>
                <td>
                  <div className="row gap-sm">
                    <div className="meter" style={{ flex: 1 }}>
                      <span style={{ width: `${Math.round(r.utilization * 100)}%` }} />
                    </div>
                    <span className="muted" style={{ width: 44, textAlign: "right" }}>
                      {Math.round(r.utilization * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IssuesSection({ data }: { data: ScheduleAnalytics }) {
  if (data.conflicts.length === 0 && data.coverage_issues.length === 0) {
    return (
      <section className="card success">
        <h3>Замечаний нет</h3>
        <p className="muted">
          Накладок не найдено, часы в расписании совпадают с учебным планом.
        </p>
      </section>
    );
  }
  return (
    <>
      {data.conflicts.length > 0 && (
        <section className="card error-soft">
          <h3>Накладки ({data.conflicts.length})</h3>
          <p className="muted">
            Учитель или кабинет заняты дважды в одном слоте вне совмещённого
            урока. Такое расписание провести нельзя.
          </p>
          <ul className="issue-list">
            {data.conflicts.slice(0, 40).map((c, i) => (
              <li key={i}>
                {c.kind === "teacher" ? "Учитель" : "Кабинет"} <b>{c.entity_id}</b> —{" "}
                {DAY_NAMES[c.day]}, урок {c.period + 1}: {c.class_ids.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.coverage_issues.length > 0 && (
        <section className="card warn-soft">
          <h3>Расхождения с учебным планом ({data.coverage_issues.length})</h3>
          <ul className="issue-list">
            {data.coverage_issues.slice(0, 40).map((c, i) => (
              <li key={i}>
                {c.class_id} · {c.subject_id}: по плану {c.planned} ч, в
                расписании {c.scheduled}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function classTypeLabel(t: string): string {
  return { normal: "обычный", luo: "ЛУО", do: "надомное", inclusive: "инклюзия" }[t] ?? t;
}

function Stat({
  label, value, tone, hint,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warn" | "bad";
  hint?: string;
}) {
  const cls = tone ? `stat stat-${tone}` : "stat";
  return (
    <div className={cls} title={hint}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

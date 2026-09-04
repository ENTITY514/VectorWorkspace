import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, type PieLabelRenderProps } from "recharts";
import { scheduleApi } from "../api";
import { saveBinaryFile, saveTextFile } from "../../../lib/saver";
import type { ScheduleState, ScheduleGenerateResult, ScheduleAnalytics } from "../../../types";
import { STATUS_LABELS } from "../../../types";
import { showToast } from "../../../components/Toast";

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

interface DashboardProps {
  state: ScheduleState;
  onGenerate: () => void;
  onRefresh: () => void;
  onExport: () => void;
  lastResult?: ScheduleGenerateResult | null;
}

export function ScheduleDashboard({ state, onGenerate, onRefresh, onExport, lastResult }: DashboardProps) {
  const { slots } = state;

  const readiness = [
    { label: "Учителя", ok: state.teachers.length > 0, count: state.teachers.length },
    { label: "Классы", ok: state.classes.length > 0, count: state.classes.length },
    { label: "Кабинеты", ok: state.rooms.length > 0, count: state.rooms.length },
    { label: "Предметы", ok: state.subjects.length > 0, count: state.subjects.length },
    { label: "Нагрузка", ok: state.curriculum.length > 0, count: state.curriculum.length },
  ];
  const ready = readiness.every(r => r.ok);

  // Метрики считает ядро (schedule_analytics). Раньше здесь был свой расчёт
  // с захардкоженной шестидневкой, а идентификатор класса собирался как
  // `${grade}${letter}` — в базе они вида «7б_luo», поэтому фильтр не
  // находил ничего и максимальная нагрузка класса всегда выходила нулевой.
  const [analytics, setAnalytics] = useState<ScheduleAnalytics | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (slots.length === 0) { setAnalytics(null); return; }
    scheduleApi
      .analytics()
      .then((a) => { if (!cancelled) setAnalytics(a); })
      .catch(() => { if (!cancelled) setAnalytics(null); });
    return () => { cancelled = true; };
  }, [slots.length]);

  const handleExport = async (format: string) => {
    try {
      const data = await scheduleApi.exportSchedule(format);
      // Браузерная загрузка (<a download>) в webview Tauri молча не работает:
      // файл никуда не попадает, а пользователь видит сообщение об успехе.
      // Сохраняем через нативный диалог.
      let path: string | null;
      if (format === "xlsx") {
        const b64 = data.split(",")[1] || data;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        path = await saveBinaryFile(bytes, "Расписание.xlsx");
      } else {
        path = await saveTextFile(data, `Расписание.${format}`);
      }
      if (path) showToast(`Сохранено: ${path}`, "success");
    } catch (e) {
      showToast(`Не удалось сохранить: ${String(e)}`, "error");
    }
  };

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Готовность</h3>
        <div className="readiness">
          {readiness.map(r => (
            <span key={r.label} className={r.ok ? "badge badge-green" : "badge"}>{r.label}: {r.count} {r.ok ? "✓" : "✗"}</span>
          ))}
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!ready} onClick={onGenerate} title={ready ? "" : "Заполните справочники и нагрузку"}>Сгенерировать</button>
          <button className="btn" onClick={onRefresh}>Обновить</button>
          <button className="btn" onClick={() => scheduleApi.clearSlots().then(onRefresh)}>Очистить слоты</button>
          {slots.length > 0 && (
            <>
              <button className="btn" onClick={onExport}>Выгрузить расписание…</button>
              <button className="btn" onClick={() => handleExport("csv")} title="Плоский список слотов для обработки в другой программе">Данные CSV</button>
            </>
          )}
        </div>
        {!ready && <p className="muted">Заполните все справочники и матрицу нагрузки чтобы активировать генерацию.</p>}
      </div>

      {lastResult && (
        <div className="card">
          <h3>Результат генерации</h3>
          <div className="analytics-summary">
            <div className="stat-card">
              <div className="stat-label">Статус</div>
              <div className="stat-value">{STATUS_LABELS[lastResult.status]}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Штраф</div>
              <div className="stat-value">{lastResult.penalties.total.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Время</div>
              <div className="stat-value">{(lastResult.solver_stats.wall_ms / 1000).toFixed(1)}с</div>
            </div>
          </div>
        </div>
      )}

      {analytics && (
        <div className="card">
          <h3>Качество расписания</h3>
          <div className="stat-row">
            <div className="stat"><div className="stat-value">{analytics.total_lessons}</div><div className="stat-label">Уроков</div></div>
            <div className={analytics.student_windows === 0 ? "stat stat-good" : "stat stat-bad"}>
              <div className="stat-value">{analytics.student_windows}</div>
              <div className="stat-label">Окна у учеников</div>
            </div>
            <div className={analytics.teacher_windows === 0 ? "stat stat-good" : "stat"}>
              <div className="stat-value">{analytics.teacher_windows}</div>
              <div className="stat-label">Окна у учителей</div>
            </div>
            <div className={analytics.conflicts.length === 0 ? "stat stat-good" : "stat stat-bad"}>
              <div className="stat-value">{analytics.conflicts.length}</div>
              <div className="stat-label">Накладки</div>
            </div>
            <div className={analytics.sanpin_hard_at_late_periods === 0 ? "stat stat-good" : "stat stat-warn"}>
              <div className="stat-value">{analytics.sanpin_hard_at_late_periods}</div>
              <div className="stat-label">Трудные поздно</div>
            </div>
            <div className={analytics.coverage_issues.length === 0 ? "stat stat-good" : "stat stat-warn"}>
              <div className="stat-value">{analytics.coverage_issues.length}</div>
              <div className="stat-label">Расхождений с планом</div>
            </div>
          </div>
          <p className="muted">Подробная разбивка — на странице «Аналитика».</p>
        </div>
      )}

      {/* ─── Charts (absorbed from AnalyticsCharts) ─── */}
      {slots.length > 0 && <ScheduleCharts state={state} />}

      <div className="card">
        <h3>Результат</h3>
        {slots.length === 0 ? <p className="muted">Расписание ещё не сгенерировано.</p> : <p>Слотов: {slots.length} · Пример: {slots[0].class_id} {slots[0].subject_id} {slots[0].day + 1}-{slots[0].period + 1}</p>}
      </div>
    </div>
  );
}

/* ─── Inline charts (was AnalyticsCharts) ─── */
function ScheduleCharts({ state }: { state: ScheduleState }) {
  const { slots, teachers } = state;

  const windowsData = useMemo(() => {
    const map = new Map<string, number>();
    for (const teacher of teachers) {
      const teacherSlots = slots.filter(s => s.teacher_id === teacher.id);
      let totalWindows = 0;
      const dayCount = slots.reduce((m, s) => Math.max(m, s.day), 0) + 1;
      for (let day = 0; day < dayCount; day++) {
        const daySlots = teacherSlots.filter(s => s.day === day).map(s => s.period).sort((a, b) => a - b);
        if (daySlots.length > 1) {
          const windows = daySlots[daySlots.length - 1] - daySlots[0] + 1 - daySlots.length;
          if (windows > 0) totalWindows += windows;
        }
      }
      if (totalWindows > 0) map.set(teacher.full_name, totalWindows);
    }
    return Array.from(map.entries())
      .map(([name, windows]) => ({ name: name.slice(0, 15), окна: windows }))
      .sort((a, b) => b.окна - a.окна)
      .slice(0, 10);
  }, [slots, teachers]);

  const loadByDay = useMemo(() => {
    const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    // Число дней берётся из самих данных: сетка настраивается, и литерал
    // «шесть дней» рисовал пустую субботу на пятидневке.
    const maxDay = slots.reduce((m, s) => Math.max(m, s.day), 0);
    return names.slice(0, maxDay + 1).map((day, i) => ({
      день: day,
      слоты: slots.filter((s) => s.day === i).length,
    }));
  }, [slots]);

  const loadByPeriod = useMemo(() => {
    // Число уроков — из данных: сетка настраивается, литерал «семь» рисовал
    // лишние пустые столбцы или обрезал восьмой урок.
    const maxPeriod = slots.reduce((m, s) => Math.max(m, s.period), 0);
    return Array.from({ length: maxPeriod + 1 }, (_, i) => ({
      урок: `${i + 1}`,
      слоты: slots.filter((s) => s.period === i).length,
    }));
  }, [slots]);

  const subjectData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots) map.set(s.subject_id, (map.get(s.subject_id) || 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [slots]);

  const sanpinData = useMemo(() => {
    const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const maxDay = slots.reduce((m, s) => Math.max(m, s.day), 0);
    return names.slice(0, maxDay + 1).map((day, i) => {
      const daySlots = slots.filter(s => s.day === i);
      const avgWeight = daySlots.length > 0
        ? daySlots.reduce((sum, s) => sum + (state.subjects.find(sub => sub.id === s.subject_id)?.sanitary_weight || 5), 0) / daySlots.length
        : 0;
      return { день: day, вес: Math.round(avgWeight * 10) / 10 };
    });
  }, [slots, state.subjects]);

  const tipStyle = { background: "var(--bg-surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)" };

  return (
    <div className="card">
      <h3>Графики расписания</h3>
      <div className="charts-grid">
        {windowsData.length > 0 && (
          <div className="chart-container">
            <h4>Окна у учителей (топ-10)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={windowsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="окна" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="chart-container">
          <h4>Нагрузка по дням</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={loadByDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="день" />
              <YAxis />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="слоты" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container">
          <h4>Нагрузка по урокам</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={loadByPeriod} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="урок" />
              <YAxis />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="слоты" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container">
          <h4>СанПиН-парабола (средний вес по дням)</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={sanpinData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="день" />
              <YAxis />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="вес" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container">
          <h4>Распределение предметов</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={subjectData} cx="50%" cy="50%" labelLine={false}
                label={({ name, percent }: PieLabelRenderProps) => `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {subjectData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

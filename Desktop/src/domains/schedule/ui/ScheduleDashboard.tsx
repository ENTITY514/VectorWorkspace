import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, type PieLabelRenderProps } from "recharts";
import { scheduleApi } from "../api";
import type { ScheduleState, ScheduleGenerateResult } from "../../../types";
import { STATUS_LABELS } from "../../../types";
import { showToast } from "../../../components/Toast";

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

interface DashboardProps {
  state: ScheduleState;
  onGenerate: () => void;
  onRefresh: () => void;
  lastResult?: ScheduleGenerateResult | null;
}

export function ScheduleDashboard({ state, onGenerate, onRefresh, lastResult }: DashboardProps) {
  const { slots } = state;

  const readiness = [
    { label: "Учителя", ok: state.teachers.length > 0, count: state.teachers.length },
    { label: "Классы", ok: state.classes.length > 0, count: state.classes.length },
    { label: "Кабинеты", ok: state.rooms.length > 0, count: state.rooms.length },
    { label: "Предметы", ok: state.subjects.length > 0, count: state.subjects.length },
    { label: "Нагрузка", ok: state.curriculum.length > 0, count: state.curriculum.length },
  ];
  const ready = readiness.every(r => r.ok);

  const analytics = useMemo(() => {
    if (slots.length === 0) return null;
    const windowsByTeacher = new Map<string, number>();
    for (const teacher of state.teachers) {
      const teacherSlots = slots.filter(s => s.teacher_id === teacher.id);
      for (const day of [0, 1, 2, 3, 4, 5]) {
        const daySlots = teacherSlots.filter(s => s.day === day).map(s => s.period).sort((a, b) => a - b);
        if (daySlots.length > 1) {
          const windows = daySlots[daySlots.length - 1] - daySlots[0] + 1 - daySlots.length;
          if (windows > 0) windowsByTeacher.set(teacher.id, (windowsByTeacher.get(teacher.id) || 0) + windows);
        }
      }
    }
    const totalWindows = Array.from(windowsByTeacher.values()).reduce((a, b) => a + b, 0);
    const maxClassLoad = Math.max(...state.classes.map(c => {
      const classSlots = slots.filter(s => s.class_id === `${c.grade}${c.letter}`);
      return Math.max(...[0, 1, 2, 3, 4, 5].map(d => classSlots.filter(s => s.day === d).length));
    }));
    const maxTeacherLoad = Math.max(...state.teachers.map(t => {
      const teacherSlots = slots.filter(s => s.teacher_id === t.id);
      return Math.max(...[0, 1, 2, 3, 4, 5].map(d => teacherSlots.filter(s => s.day === d).length));
    }));
    const doubleLessons = slots.filter(s => s.is_double).length;
    return { totalWindows, maxClassLoad, maxTeacherLoad, doubleLessons };
  }, [slots, state.teachers, state.classes]);

  const handleExport = async (format: string) => {
    try {
      const data = await scheduleApi.exportSchedule(format);
      if (format === "xlsx") {
        const b64 = data.split(",")[1] || data;
        const bytes = atob(b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "schedule.xlsx";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([data], { type: format === "csv" ? "text/csv" : "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `schedule.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      showToast(`Экспорт ${format.toUpperCase()} выполнен`, "success");
    } catch (e) { showToast(String(e), "error"); }
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
              <button className="btn" onClick={() => handleExport("xlsx")}>Экспорт XLSX</button>
              <button className="btn" onClick={() => handleExport("csv")}>Экспорт CSV</button>
              <button className="btn" onClick={() => handleExport("json")}>Экспорт JSON</button>
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
          <h3>Аналитика расписания</h3>
          <div className="analytics-summary">
            <div className="stat-card"><div className="stat-label">Всего слотов</div><div className="stat-value">{slots.length}</div></div>
            <div className="stat-card"><div className="stat-label">Окон у учителей</div><div className="stat-value">{analytics.totalWindows}</div></div>
            <div className="stat-card"><div className="stat-label">Макс. уроков/день (класс)</div><div className="stat-value">{analytics.maxClassLoad}</div></div>
            <div className="stat-card"><div className="stat-label">Макс. уроков/день (учитель)</div><div className="stat-value">{analytics.maxTeacherLoad}</div></div>
            <div className="stat-card"><div className="stat-label">Двойных уроков</div><div className="stat-value">{analytics.doubleLessons}</div></div>
          </div>
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
      for (const day of [0, 1, 2, 3, 4, 5]) {
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
    const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return days.map((day, i) => ({ день: day, слоты: slots.filter(s => s.day === i).length }));
  }, [slots]);

  const loadByPeriod = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => ({ урок: `${i + 1}`, слоты: slots.filter(s => s.period === i).length })),
  [slots]);

  const subjectData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots) map.set(s.subject_id, (map.get(s.subject_id) || 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [slots]);

  const sanpinData = useMemo(() => {
    const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return days.map((day, i) => {
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

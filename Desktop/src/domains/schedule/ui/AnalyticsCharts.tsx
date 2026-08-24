import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, type PieLabelRenderProps } from "recharts";
import type { ScheduleState } from "../../../types";

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

interface ChartsProps {
  state: ScheduleState;
}

export function AnalyticsCharts({ state }: ChartsProps) {
  const { slots, teachers } = state;

  // Windows by teacher
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
      if (totalWindows > 0) {
        map.set(teacher.full_name, totalWindows);
      }
    }
    return Array.from(map.entries())
      .map(([name, windows]) => ({ name: name.slice(0, 15), окна: windows }))
      .sort((a, b) => b.окна - a.окна)
      .slice(0, 10);
  }, [slots, teachers]);

  // Load by day
  const loadByDay = useMemo(() => {
    const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return days.map((day, i) => ({
      день: day,
      слоты: slots.filter(s => s.day === i).length,
    }));
  }, [slots]);

  // Load by period
  const loadByPeriod = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => ({
      урок: `${i + 1}`,
      слоты: slots.filter(s => s.period === i).length,
    }));
  }, [slots]);

  // Subject distribution
  const subjectData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots) {
      map.set(s.subject_id, (map.get(s.subject_id) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [slots]);

  // SanPiN distribution (classes load per day)
  const sanpinData = useMemo(() => {
    const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const byDay = days.map((day, i) => {
      const daySlots = slots.filter(s => s.day === i);
      const avgWeight = daySlots.length > 0
        ? daySlots.reduce((sum, s) => {
            const subj = state.subjects.find(sub => sub.id === s.subject_id);
            return sum + (subj?.sanitary_weight || 5);
          }, 0) / daySlots.length
        : 0;
      return { день: day, вес: Math.round(avgWeight * 10) / 10 };
    });
    return byDay;
  }, [slots, state.subjects]);

  if (slots.length === 0) {
    return <div className="card"><p className="muted">Нет данных для графиков. Сгенерируйте расписание.</p></div>;
  }

  return (
    <div className="card">
      <h3>Графики расписания</h3>

      <div className="charts-grid">
        {/* Windows by teacher */}
        {windowsData.length > 0 && (
          <div className="chart-container">
            <h4>Окна у учителей (топ-10)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={windowsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
                <Bar dataKey="окна" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Load by day */}
        <div className="chart-container">
          <h4>Нагрузка по дням</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={loadByDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="день" />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <Bar dataKey="слоты" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Load by period */}
        <div className="chart-container">
          <h4>Нагрузка по урокам</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={loadByPeriod} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="урок" />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <Line type="monotone" dataKey="слоты" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* SanPiN parabola */}
        <div className="chart-container">
          <h4>СанПиН-парабола (средний вес по дням)</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={sanpinData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="день" />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <Line type="monotone" dataKey="вес" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Subject distribution */}
        <div className="chart-container">
          <h4>Распределение предметов</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={subjectData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }: PieLabelRenderProps) => `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {subjectData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

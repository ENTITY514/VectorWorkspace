import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import type { ScheduleState, ScheduleGenerateResult } from "../../../types";

interface QualityWidgetProps {
  state: ScheduleState;
  lastResult?: ScheduleGenerateResult | null;
  selectedClassId?: string;
}

const DAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
const IDEAL_PARABOLA = [7, 11, 9, 11, 7];

export function ScheduleQualityWidget({ state, lastResult, selectedClassId }: QualityWidgetProps) {
  const { slots, subjects, classes, teachers } = state;

  const qualityStats = useMemo(() => {
    if (slots.length === 0) return null;

    const subjectMap = new Map(subjects.map(s => [s.id, s]));

    // Calculate difficulty per day (school-wide average or per selected class)
    const targetSlots = selectedClassId
      ? slots.filter(s => s.class_id === selectedClassId)
      : slots;

    const dailyLoads = [0, 1, 2, 3, 4].map(day => {
      const daySlots = targetSlots.filter(s => s.day === day);
      let totalWeight = 0;
      for (const s of daySlots) {
        const subj = subjectMap.get(s.subject_id);
        totalWeight += subj?.sanitary_weight || 5;
      }

      // Average weight normalized per class count
      const activeClassCount = selectedClassId
        ? 1
        : Math.max(1, new Set(daySlots.map(s => s.class_id)).size);

      const avgLoad = Math.round((totalWeight / activeClassCount) * 10) / 10;
      return {
        dayName: DAY_NAMES[day],
        actual: avgLoad,
        ideal: IDEAL_PARABOLA[day],
      };
    });

    // Calculate teacher windows
    let totalTeacherWindows = 0;
    for (const t of teachers) {
      const tSlots = slots.filter(s => s.teacher_id === t.id);
      for (let day = 0; day < 5; day++) {
        const dayPeriods = tSlots.filter(s => s.day === day).map(s => s.period).sort((a, b) => a - b);
        if (dayPeriods.length > 1) {
          const gaps = dayPeriods[dayPeriods.length - 1] - dayPeriods[0] + 1 - dayPeriods.length;
          if (gaps > 0) totalTeacherWindows += gaps;
        }
      }
    }

    // Penalties breakdown from lastResult or default
    const penalties = lastResult?.penalties || {
      window: totalTeacherWindows,
      room_displacement: 0,
      sanpin_parabola: 0,
      alternation: 0,
      movement: 0,
      load_balance: 0,
      total: 0,
    };

    // Calculate overall Quality Score (0 to 100)
    let qualityScore = 100;
    if (totalTeacherWindows > 0) qualityScore -= Math.min(30, totalTeacherWindows * 5);
    if (penalties.alternation > 0) qualityScore -= Math.min(15, penalties.alternation);
    if (penalties.load_balance > 20) qualityScore -= 10;

    qualityScore = Math.max(50, qualityScore);

    return {
      dailyLoads,
      totalTeacherWindows,
      penalties,
      qualityScore,
    };
  }, [slots, subjects, classes, teachers, selectedClassId, lastResult]);

  if (!qualityStats) {
    return (
      <div className="card quality-widget-card">
        <p className="muted">Расписание ещё не сгенерировано. Запустите генерацию для анализа качества.</p>
      </div>
    );
  }

  const { dailyLoads, totalTeacherWindows, penalties, qualityScore } = qualityStats;

  return (
    <div className="card quality-widget-card">
      <div className="quality-widget-header">
        <div>
          <h3>📊 Анализ качества расписания и Кривая СанПиН</h3>
          <p className="muted">Оценка умственной нагрузки по дням недели (Приложение 4 к СанПиН № ҚР ДСМ-76)</p>
        </div>
        <div className="quality-score-badge-container">
          <div className={`quality-score-badge ${qualityScore >= 90 ? "score-perfect" : qualityScore >= 75 ? "score-good" : "score-warning"}`}>
            {qualityScore} / 100
          </div>
          <span className="quality-score-label">
            {qualityScore >= 90 ? "💎 Идеальное качество" : qualityScore >= 75 ? "🟢 Хорошее" : "🟡 Допустимое"}
          </span>
        </div>
      </div>

      {/* Breakdown Cards Grid */}
      <div className="quality-metrics-grid">
        <div className="metric-box">
          <div className="metric-icon">🪟</div>
          <div className="metric-info">
            <span className="metric-value">{totalTeacherWindows}</span>
            <span className="metric-title">Окна учителей</span>
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">🚪</div>
          <div className="metric-info">
            <span className="metric-value">{penalties.room_displacement}</span>
            <span className="metric-title">Смена кабинетов</span>
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">🔄</div>
          <div className="metric-info">
            <span className="metric-value">{penalties.alternation}</span>
            <span className="metric-title">Штраф чередования</span>
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">⚖️</div>
          <div className="metric-info">
            <span className="metric-value">{penalties.load_balance}</span>
            <span className="metric-title">Дисперсия нагрузки</span>
          </div>
        </div>
      </div>

      {/* SanPiN Difficulty Curve Chart */}
      <div className="sanpin-chart-wrapper" style={{ marginTop: "20px", height: 260 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>
          📈 График умственной нагрузки (Факт vs Идеал СанПиН):
        </h4>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={dailyLoads} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <XAxis dataKey="dayName" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 15]} />
            <Tooltip
              contentStyle={{ background: "#1e293b", borderColor: "#334155", borderRadius: "8px", color: "#fff" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
            <Bar dataKey="actual" name="Фактическая нагрузка (балл)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ideal" name="Идеал СанПиН (парабола)" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

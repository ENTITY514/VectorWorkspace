import { useMemo } from "react";
import { scheduleApi } from "../api";
import type { ScheduleState, ScheduleGenerateResult } from "../../../types";
import { STATUS_LABELS } from "../../../types";

interface DashboardProps {
  state: ScheduleState;
  onGenerate: () => void;
  onRefresh: () => void;
  lastResult?: ScheduleGenerateResult | null;
}

export function ScheduleDashboard({ state, onGenerate, onRefresh, lastResult }: DashboardProps) {
  const readiness = [
    { label: "Учителя", ok: state.teachers.length > 0, count: state.teachers.length },
    { label: "Классы", ok: state.classes.length > 0, count: state.classes.length },
    { label: "Кабинеты", ok: state.rooms.length > 0, count: state.rooms.length },
    { label: "Предметы", ok: state.subjects.length > 0, count: state.subjects.length },
    { label: "Нагрузка", ok: state.curriculum.length > 0, count: state.curriculum.length },
  ];
  const ready = readiness.every(r => r.ok);
  const slots = state.slots;

  const analytics = useMemo(() => {
    if (slots.length === 0) return null;

    // Подсчёт окон по учителям
    const windowsByTeacher = new Map<string, number>();
    for (const teacher of state.teachers) {
      const teacherSlots = slots.filter(s => s.teacher_id === teacher.id);
      for (const day of [0, 1, 2, 3, 4, 5]) {
        const daySlots = teacherSlots.filter(s => s.day === day).map(s => s.period).sort((a, b) => a - b);
        if (daySlots.length > 1) {
          const windows = daySlots[daySlots.length - 1] - daySlots[0] + 1 - daySlots.length;
          if (windows > 0) {
            windowsByTeacher.set(teacher.id, (windowsByTeacher.get(teacher.id) || 0) + windows);
          }
        }
      }
    }
    const totalWindows = Array.from(windowsByTeacher.values()).reduce((a, b) => a + b, 0);

    // Макс. нагрузка на класс по дням
    const maxClassLoad = Math.max(...state.classes.map(c => {
      const classSlots = slots.filter(s => s.class_id === `${c.grade}${c.letter}`);
      const byDay = [0, 1, 2, 3, 4, 5].map(d => classSlots.filter(s => s.day === d).length);
      return Math.max(...byDay);
    }));

    // Макс. нагрузка на учителя по дням
    const maxTeacherLoad = Math.max(...state.teachers.map(t => {
      const teacherSlots = slots.filter(s => s.teacher_id === t.id);
      const byDay = [0, 1, 2, 3, 4, 5].map(d => teacherSlots.filter(s => s.day === d).length);
      return Math.max(...byDay);
    }));

    // Двойные уроки
    const doubleLessons = slots.filter(s => s.is_double).length;

    return { totalWindows, maxClassLoad, maxTeacherLoad, doubleLessons };
  }, [slots, state.teachers, state.classes]);

  const importLegacy = async (q: number) => {
    try {
      await scheduleApi.importLegacy(q);
      await onRefresh();
      alert(`Импорт Q${q} выполнен`);
    } catch (e) { alert(String(e)); }
  };

  const handleExport = async (format: string) => {
    try {
      const data = await scheduleApi.exportSchedule(format);
      const blob = new Blob([data], { type: format === "csv" ? "text/csv" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schedule.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(String(e)); }
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
            <div className="stat-card">
              <div className="stat-label">Всего слотов</div>
              <div className="stat-value">{slots.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Окон у учителей</div>
              <div className="stat-value">{analytics.totalWindows}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Макс. уроков/день (класс)</div>
              <div className="stat-value">{analytics.maxClassLoad}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Макс. уроков/день (учитель)</div>
              <div className="stat-value">{analytics.maxTeacherLoad}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Двойных уроков</div>
              <div className="stat-value">{analytics.doubleLessons}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Импорт данных прошлого года</h3>
        <p className="muted">Загрузить недельный шаблон прошлого года (27 классов, 39 учителей) по четвертям — 1 неделя достаточно.</p>
        <div className="row">
          {[1, 2, 3, 4].map(q => <button key={q} className="btn" onClick={() => importLegacy(q)}>Импорт Q{q}</button>)}
        </div>
      </div>

      <div className="card">
        <h3>Результат</h3>
        {slots.length === 0 ? <p className="muted">Расписание ещё не сгенерировано.</p> : <p>Слотов: {slots.length} · Пример: {slots[0].class_id} {slots[0].subject_id} {slots[0].day + 1}-{slots[0].period + 1}</p>}
      </div>
    </div>
  );
}

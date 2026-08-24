import { useEffect, useState } from "react";
import { scheduleApi } from "./api";
import type { ScheduleState, ScheduleGenerateResult } from "../../types";
import { STATUS_LABELS, INFEASIBLE_REASON_LABELS, ENTITY_TYPE_LABELS } from "../../types";
import { ScheduleDashboard } from "./ui/ScheduleDashboard";
import { TeachersTab } from "./ui/TeachersTab";
import { ClassesTab } from "./ui/ClassesTab";
import { RoomsTab } from "./ui/RoomsTab";
import { SubjectsTab } from "./ui/SubjectsTab";
import { CurriculumTab } from "./ui/CurriculumTab";
import { WeightsTab } from "./ui/WeightsTab";
import { GridTab } from "./ui/GridTab";
import { LegacyTab } from "./ui/LegacyTab";
import { ComparisonTab } from "./ui/ComparisonTab";
import { AnalyticsCharts } from "./ui/AnalyticsCharts";

type Tab = "dashboard" | "teachers" | "classes" | "rooms" | "subjects" | "curriculum" | "weights" | "grid" | "legacy" | "benchmark" | "charts";

export function SchedulePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [state, setState] = useState<ScheduleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScheduleGenerateResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const s = await scheduleApi.getState();
      setState(s);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenStatus("Генерация...");
    setError(null);
    try {
      const res = await scheduleApi.generate({ time_limit_sec: 60, num_workers: 8, seed: 42 });
      setGenStatus(`Статус: ${STATUS_LABELS[res.status]} (штраф ${res.penalties.total}, ${res.solver_stats.wall_ms}мс)`);
      setLastResult(res);
      if (res.diagnostics.infeasible_core) {
        const core = res.diagnostics.infeasible_core;
        const reasonLabel = INFEASIBLE_REASON_LABELS[core.reason] || core.reason;
        const entities = core.conflicting_entities.map(e => ENTITY_TYPE_LABELS[e] || e).join(", ");
        setError(`Невозможно: ${reasonLabel}${entities ? ` (${entities})` : ""}. ${core.suggestion}`);
      }
      await load();
    } catch (e: unknown) {
      setError(String(e));
      setGenStatus(null);
    }
  };

  if (loading) return <div className="panel">Загрузка расписания...</div>;
  if (error && !state) return <div className="panel error">{error}</div>;

  return (
    <div className="panel schedule-page">
      <div className="panel-header">
        <h1>Расписание</h1>
        <p className="muted">Алгоритм CP-SAT · 0 коллизий · СанПиН-парабола</p>
      </div>

      <div className="tabs" role="tablist">
        {(["dashboard","teachers","classes","rooms","subjects","curriculum","weights","grid","legacy","benchmark","charts"] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab===t} className={tab===t?"tab active":"tab"} onClick={()=>setTab(t)}>
            {labelForTab(t)}
          </button>
        ))}
      </div>

      {genStatus && <div className="notice">{genStatus}</div>}
      {error && <div className="error notice">{error}</div>}

      {tab==="dashboard" && <ScheduleDashboard state={state!} onGenerate={handleGenerate} onRefresh={load} lastResult={lastResult} />}
      {tab==="teachers" && <TeachersTab />}
      {tab==="classes" && <ClassesTab />}
      {tab==="rooms" && <RoomsTab />}
      {tab==="subjects" && <SubjectsTab />}
      {tab==="curriculum" && <CurriculumTab />}
      {tab==="weights" && <WeightsTab state={state!} onSaved={load} />}
      {tab==="grid" && <GridTab state={state!} />}
      {tab==="legacy" && <LegacyTab />}
      {tab==="benchmark" && <ComparisonTab />}
      {tab==="charts" && <AnalyticsCharts state={state!} />}
    </div>
  );
}

function labelForTab(t: Tab): string {
  const m: Record<Tab,string> = {
    dashboard: "Сводка",
    teachers: "Учителя",
    classes: "Классы",
    rooms: "Кабинеты",
    subjects: "Предметы",
    curriculum: "Нагрузка",
    weights: "Веса",
    grid: "Матрица",
    legacy: "Импортированное",
    benchmark: "Сравнение",
    charts: "Графики",
  };
  return m[t];
}

import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "./api";
import type { ScheduleState, ScheduleGenerateResult, ScheduleVariant } from "../../types";
import { STATUS_LABELS, INFEASIBLE_REASON_LABELS, ENTITY_TYPE_LABELS } from "../../types";
import { ScheduleDashboard } from "./ui/ScheduleDashboard";
import { TeachersTab } from "./ui/TeachersTab";
import { ClassesTab } from "./ui/ClassesTab";
import { RoomsTab } from "./ui/RoomsTab";
import { SubjectsTab } from "./ui/SubjectsTab";
import { CurriculumTab } from "./ui/CurriculumTab";
import { WeightsTab } from "./ui/WeightsTab";
import { GridTab } from "./ui/GridTab";
import { AnalyticsCharts } from "./ui/AnalyticsCharts";

type Tab = "dashboard" | "teachers" | "classes" | "rooms" | "subjects" | "curriculum" | "weights" | "grid" | "charts";

export function SchedulePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [state, setState] = useState<ScheduleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScheduleGenerateResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [variants, setVariants] = useState<ScheduleVariant[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const s = await scheduleApi.getState();
      setState(s);
      if (s.variants) setVariants(s.variants);
      // Auto-import Q4 if subjects are missing
      if (s.subjects.length === 0 && !importing) {
        setImporting(true);
        try {
          await scheduleApi.importLegacy(4);
          const s2 = await scheduleApi.getState();
          setState(s2);
          if (s2.variants) setVariants(s2.variants);
        } catch (e2) {
          console.error("Auto-import failed:", e2);
          setError(`Ошибка импорта: ${String(e2)}`);
        } finally {
          setImporting(false);
        }
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Active variant
  const activeVariant = useMemo(() => variants.find(v => v.is_active), [variants]);

  // Group variants: Year → Quarter → Variant
  const years = useMemo(() => {
    const ym = new Map<string, Map<number, ScheduleVariant[]>>();
    for (const v of variants) {
      if (!ym.has(v.academic_year)) ym.set(v.academic_year, new Map());
      const qm = ym.get(v.academic_year)!;
      const qn = v.quarter_number;
      if (!qm.has(qn)) qm.set(qn, []);
      qm.get(qn)!.push(v);
    }
    return ym;
  }, [variants]);

  const [selectedYear, setSelectedYear] = useState<string>("2025-2026");
  const [selectedQuarter, setSelectedQuarter] = useState<number>(4);

  // Sync selection with active variant
  useEffect(() => {
    if (activeVariant) {
      setSelectedYear(activeVariant.academic_year);
      setSelectedQuarter(activeVariant.quarter_number || 4);
    }
  }, [activeVariant]);

  // Pre-generated years: 2025-2026 → 2049-2050
  const ALL_YEARS = useMemo(() => {
    const ys: string[] = [];
    for (let start = 2025; start <= 2049; start++) {
      ys.push(`${start}-${start + 1}`);
    }
    return ys;
  }, []);

  const yearIdx = ALL_YEARS.indexOf(selectedYear);
  const prevYear = () => { if (yearIdx > 0) setSelectedYear(ALL_YEARS[yearIdx - 1]); };
  const nextYear = () => { if (yearIdx < ALL_YEARS.length - 1) setSelectedYear(ALL_YEARS[yearIdx + 1]); };

  const QUARTER_LABELS = ["1 четверть", "2 четверть", "3 четверть", "4 четверть"];
  const quarters = [1, 2, 3, 4];

  const variantsForSelection = useMemo(() => {
    if (!selectedYear || !selectedQuarter || !years.has(selectedYear)) return [];
    return years.get(selectedYear)!.get(selectedQuarter) || [];
  }, [selectedYear, selectedQuarter, years]);

  const switchVariant = async (variantId: string) => {
    try {
      await scheduleApi.setActiveVariant(variantId);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreateVariant = async () => {
    const vn = variantsForSelection.length + 1;
    try {
      await scheduleApi.createVariant({
        name: `${QUARTER_LABELS[(selectedQuarter || 4) - 1]}, Вариант ${vn}`,
        academic_year: selectedYear || "2025-2026",
        quarter_number: selectedQuarter || 4,
        variant_number: vn,
        copy_from_variant_id: activeVariant?.id,
      });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!window.confirm("Удалить вариант? Слоты будут удалены.")) return;
    try {
      await scheduleApi.deleteVariant(variantId);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

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

  if (loading) return <div className="panel">{importing ? "Первый запуск — импорт данных Q4..." : "Загрузка расписания..."}</div>;
  if (error && !state) return <div className="panel error">{error}</div>;

  return (
    <div className="panel schedule-page">
      <div className="panel-header">
        <h1>Расписание</h1>
        <p className="muted">Алгоритм CP-SAT · 0 коллизий · СанПиН-парабола</p>
      </div>

      {/* ===== Year → Quarter → Variant navigation ===== */}
      <div className="card variant-nav">
        <div className="variant-nav-row">
          <span className="variant-nav-label">Год:</span>
          <button className="btn btn-small" onClick={prevYear} disabled={yearIdx <= 0}>◀</button>
          <span className="variant-year-display">{selectedYear}</span>
          <button className="btn btn-small" onClick={nextYear} disabled={yearIdx >= ALL_YEARS.length - 1}>▶</button>
        </div>
        <div className="variant-nav-row">
          <span className="variant-nav-label">Четверть:</span>
          {quarters.map(q => (
            <button key={q} className={`btn btn-small ${selectedQuarter === q ? "btn-primary" : ""}`} onClick={() => setSelectedQuarter(q)}>
              {QUARTER_LABELS[q - 1]}
            </button>
          ))}
        </div>
        <div className="variant-nav-row">
          <span className="variant-nav-label">Вариант:</span>
          {variantsForSelection.length === 0 && (
            <span className="muted" style={{ marginRight: 8 }}>Нет вариантов</span>
          )}
          {variantsForSelection.map(v => (
            <span key={v.id} className={`variant-chip ${v.is_active ? "active" : ""}`} onClick={() => switchVariant(v.id)}>
              Вариант {v.variant_number} {v.is_active ? "●" : ""}
              {variantsForSelection.length > 1 && (
                <span className="variant-delete" onClick={(e) => { e.stopPropagation(); handleDeleteVariant(v.id); }}>×</span>
              )}
            </span>
          ))}
          <button className="btn btn-small btn-primary" onClick={handleCreateVariant}>+ Вариант</button>
        </div>
        {activeVariant && (
          <div className="variant-nav-active">
            Активен: <strong>{activeVariant.name}</strong> ({activeVariant.academic_year}, {QUARTER_LABELS[(activeVariant.quarter_number || 1) - 1]}, Вариант {activeVariant.variant_number})
          </div>
        )}
      </div>

      <div className="tabs" role="tablist">
        {(["dashboard","teachers","classes","rooms","subjects","curriculum","weights","grid","charts"] as Tab[]).map(t => (
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
    charts: "Графики",
  };
  return m[t];
}

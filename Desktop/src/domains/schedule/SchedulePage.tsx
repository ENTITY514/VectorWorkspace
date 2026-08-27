import { useEffect, useMemo, useState } from "react";
import { scheduleApi } from "./api";
import type { ScheduleState, ScheduleGenerateResult, ScheduleVariant, ScheduleSlot } from "../../types";
import { STATUS_LABELS, INFEASIBLE_REASON_LABELS, ENTITY_TYPE_LABELS } from "../../types";
import { ScheduleDashboard } from "./ui/ScheduleDashboard";
import { TeachersTab } from "./ui/TeachersTab";
import { SchoolSettings } from "./ui/SchoolSettings";
import { WeightsTab } from "./ui/WeightsTab";
import { InteractiveGrid, type GridMode } from "./ui/InteractiveGrid";
import { TeacherDrawer } from "./ui/TeacherDrawer";
import { GenerateModal } from "./ui/GenerateModal";
import { ScheduleQualityWidget } from "./ui/ScheduleQualityWidget";

type Tab = "dashboard" | "settings" | "teachers" | "weights" | "grid";

const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Сводка",
  settings: "Настройки",
  teachers: "Учителя",
  weights: "Веса",
  grid: "Расписание",
};

export function SchedulePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [state, setState] = useState<ScheduleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScheduleGenerateResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [variants, setVariants] = useState<ScheduleVariant[]>([]);

  // Modal generation states
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Teacher drawer state
  const [selectedTeacher, setSelectedTeacher] = useState<ScheduleState["teachers"][0] | null>(null);

  const [gridMode, setGridMode] = useState<GridMode>("class");
  const [porting, setPorting] = useState(false);

  const handlePin = async (slot: ScheduleSlot) => {
    const vid = activeVariant?.id;
    if (!vid) { setError("Нет активного варианта"); return; }
    try {
      await scheduleApi.pinSlot({
        variant_id: vid,
        class_id: slot.class_id,
        subject_id: slot.subject_id,
        teacher_id: slot.teacher_id,
        room_id: slot.room_id,
        day: slot.day,
        period: slot.period,
        subgroup_label: slot.subgroup_label || undefined,
      });
      await load();
    } catch (e) { setError(String(e)); }
  };

  const handleUnpin = async (slotId: string) => {
    try {
      await scheduleApi.unpinSlot(slotId);
      await load();
    } catch (e) { setError(String(e)); }
  };

  const handleDragDrop = async (slot: ScheduleSlot, day: number, period: number) => {
    if (slot.day === day && slot.period === period) return;
    const vid = activeVariant?.id;
    if (!vid) { setError("Нет активного варианта"); return; }
    try {
      // Убрать существующий закреплённый слот в целевой ячейке (если есть)
      const existingFixed = state?.fixed_slots.find(f =>
        f.variant_id === vid && f.class_id === slot.class_id && f.day === day && f.period === period
      );
      if (existingFixed) await scheduleApi.unpinSlot(existingFixed.id);
      // Закрепить на новом месте
      await scheduleApi.pinSlot({
        variant_id: vid,
        class_id: slot.class_id,
        subject_id: slot.subject_id,
        teacher_id: slot.teacher_id,
        room_id: slot.room_id,
        day,
        period,
        subgroup_label: slot.subgroup_label || undefined,
      });
      await load();
    } catch (e) { setError(String(e)); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const s = await scheduleApi.getState();
      setState(s);
      if (s.variants) setVariants(s.variants);
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

  // Автодобавление вариантов Q4 2025-2026 если после импорта осталось <3
  useEffect(() => {
    if (loading || importing) return;
    const q4vars = variants.filter(v => v.academic_year === "2025-2026" && v.quarter_number === 4);
    if (q4vars.length > 0 && q4vars.length < 3) {
      // Триггерим повторный импорт который теперь создаст недостающие варианты (V2/V3)
      (async () => {
        setImporting(true);
        try {
          await scheduleApi.importLegacy(4);
          const s2 = await scheduleApi.getState();
          setState(s2);
          if (s2.variants) setVariants(s2.variants);
        } catch (e) {
          console.error("Auto-seed V3 failed:", e);
        } finally {
          setImporting(false);
        }
      })();
    }
  }, [variants, loading]);

  const activeVariant = useMemo(() => variants.find(v => v.is_active), [variants]);

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

  useEffect(() => {
    if (activeVariant) {
      setSelectedYear(activeVariant.academic_year);
      setSelectedQuarter(activeVariant.quarter_number || 4);
    }
  }, [activeVariant]);

  const ALL_YEARS = useMemo(() => {
    const ys: string[] = [];
    for (let start = 2025; start <= 2049; start++) ys.push(`${start}-${start + 1}`);
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
    try { await scheduleApi.setActiveVariant(variantId); await load(); } catch (e) { setError(String(e)); }
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
    } catch (e) { setError(String(e)); }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!window.confirm("Удалить вариант? Слоты будут удалены.")) return;
    try { await scheduleApi.deleteVariant(variantId); await load(); } catch (e) { setError(String(e)); }
  };

  const handlePortQuarter = async (toQuarter: number) => {
    const fromQuarter = toQuarter - 1;
    if (fromQuarter < 1) { setError("Нет предыдущей четверти для копирования"); return; }
    if (!window.confirm(`Скопировать настройки (учителя, классы, нагрузку) из ${QUARTER_LABELS[fromQuarter - 1]} в ${QUARTER_LABELS[toQuarter - 1]}?`)) return;
    setPorting(true);
    try {
      const res = await scheduleApi.portQuarter(fromQuarter, toQuarter);
      setError(null);
      setGenStatus(`Портирование: ${res.cloned_teachers} учителей, ${res.cloned_classes} классов`);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setPorting(false); }
  };

  const handleStartGenerate = async (timeLimitSec: number) => {
    setIsGenerating(true);
    setGenStatus("Идёт генерация расписания...");
    setError(null);
    try {
      const res = await scheduleApi.generate({ time_limit_sec: timeLimitSec, num_workers: 8, seed: 42 });
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
    } finally {
      setIsGenerating(false);
      setIsGenerateModalOpen(false);
    }
  };

  const handleCancelGenerate = () => {
    setIsGenerating(false);
    setIsGenerateModalOpen(false);
    setGenStatus("Генерация прервана пользователем");
  };

  if (loading) return <div className="panel">{importing ? "Первый запуск — импорт данных Q4..." : "Загрузка расписания..."}</div>;
  if (error && !state) return <div className="panel error">{error}</div>;

  return (
    <div className="panel schedule-page">
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Расписание</h1>
          <p className="muted">Алгоритм CP-SAT · 0 коллизий · СанПиН-парабола</p>
        </div>
        <button
          className="btn btn-primary btn-large"
          style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)" }}
          onClick={() => setIsGenerateModalOpen(true)}
        >
          ⚡ Сгенерировать расписание
        </button>
      </div>

      {/* ===== Quality & SanPiN Widget ===== */}
      {state && (
        <ScheduleQualityWidget
          state={state}
          lastResult={lastResult}
        />
      )}

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
          {variantsForSelection.length === 0 && <span className="muted" style={{ marginRight: 8 }}>Нет вариантов</span>}
          {variantsForSelection.map(v => (
            <span key={v.id} className={`variant-chip ${v.is_active ? "active" : ""}`} onClick={() => switchVariant(v.id)}>
              Вариант {v.variant_number} {v.is_active ? "●" : ""}
              {variantsForSelection.length > 1 && (
                <span className="variant-delete" onClick={e => { e.stopPropagation(); handleDeleteVariant(v.id); }}>×</span>
              )}
            </span>
          ))}
          <button className="btn btn-small btn-primary" onClick={handleCreateVariant}>+ Вариант</button>
          {selectedQuarter > 1 && (
            <button className="btn btn-small" onClick={() => handlePortQuarter(selectedQuarter)} disabled={porting}>
              {porting ? "Копирование..." : "Скопировать настройки из предыдущей четверти"}
            </button>
          )}
        </div>
        {activeVariant && (
          <div className="variant-nav-active">
            Активен: <strong>{activeVariant.name}</strong> ({activeVariant.academic_year}, {QUARTER_LABELS[(activeVariant.quarter_number || 1) - 1]}, Вариант {activeVariant.variant_number})
          </div>
        )}
      </div>

      <div className="tabs" role="tablist">
        {(["dashboard", "settings", "teachers", "weights", "grid"] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {genStatus && <div className="notice">{genStatus}</div>}
      {error && <div className="error notice">{error}</div>}

      {tab === "dashboard" && <ScheduleDashboard state={state!} onGenerate={() => setIsGenerateModalOpen(true)} onRefresh={load} lastResult={lastResult} />}
      {tab === "settings" && <SchoolSettings />}
      {tab === "teachers" && (
        <TeachersTab onSelectTeacher={t => setSelectedTeacher(t)} />
      )}
      {tab === "weights" && <WeightsTab state={state!} onSaved={load} />}
      {tab === "grid" && (
        <InteractiveGrid
          state={state!}
          variantId={activeVariant?.id ?? null}
          mode={gridMode}
          onModeChange={setGridMode}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onDragDrop={handleDragDrop}
        />
      )}

      {/* Generation Settings & Progress Modal */}
      <GenerateModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onStartGenerate={handleStartGenerate}
        isGenerating={isGenerating}
        onCancelGenerate={handleCancelGenerate}
      />

      {/* Teacher drawer overlay */}
      {selectedTeacher && state && (
        <TeacherDrawer
          teacher={selectedTeacher}
          rooms={state.rooms}
          subjects={state.subjects}
          classes={state.classes}
          curriculum={state.curriculum}
          onSave={load}
          onClose={() => setSelectedTeacher(null)}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { Panel } from "../../../components/ui";
import type { KspStageType } from "../../../types";
import { exportKspDocument } from "../kspExport";
import { useKspEditor } from "../useKspEditor";
import { STAGE_TYPES, STAGE_LABEL, STATUS_LABEL } from "../kspModel";
import { KspExportBar } from "./KspExportBar";
import { KspHeaderPanel } from "./KspHeaderPanel";
import { KspTimingBar } from "./KspTimingBar";
import { KspValidationBar } from "./KspValidationBar";
import { KspStageCard } from "./KspStageCard";

export function KspEditor({
  kspId,
  onClose,
  onView,
  onOpenKtp,
}: {
  kspId: string;
  onClose: () => void;
  onView?: () => void;
  onOpenKtp?: (planId: string) => void;
}) {
  const hook = useKspEditor(kspId);
  const { doc, report, loading, saving, error, status, dirty, totalMinutes, save, rebalance, addStage, patchContent, requestLeave } = hook;
  const [newType, setNewType] = useState<KspStageType>("practice");

  const leave = (fn: () => void) => {
    if (requestLeave()) fn();
  };

  const exportDoc = async (format: "docx" | "xlsx" | "pdf") => {
    if (!doc) return;
    const current = dirty ? await save() : doc;
    if (current) await exportKspDocument(current, format);
  };

  if (loading) return <div className="empty">Загрузка КСП…</div>;
  if (!doc) return <div className="flash-error">{error || "КСП не найден"}</div>;

  return (
    <Panel
      title="Редактор КСП"
      subtitle="Приказ МОН РК № 130 · тема и цели из КТП"
      actions={
        <div className="row gap-sm">
          <button className="btn btn-sm" onClick={() => leave(onClose)}>К списку</button>
          {onView && <button className="btn btn-sm" onClick={() => leave(onView)}>Просмотр</button>}
          <KspExportBar onExport={exportDoc} busy={saving} />
          <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => save()}>
            {saving ? "…" : dirty ? "Сохранить" : "Сохранено"}
          </button>
          <button className="btn btn-sm" disabled={saving || !report?.canMarkReady} onClick={() => save("ready")}>
            Готов к уроку
          </button>
        </div>
      }
    >
      <div className="panel-body ksp-editor">
        {error && <div className="flash-error">{error}</div>}
        {status && <div className="flash-info">{status}</div>}

        <div className="ksp-status-line">
          <span className="badge badge-gray">{STATUS_LABEL[doc.status]}</span>
          <label className="ksp-field-inline">
            Эталон
            <select
              value={doc.content.lessonDuration}
              onChange={(e) => patchContent((d) => ({
                ...d,
                content: { ...d.content, lessonDuration: Number(e.target.value) },
              }))}
            >
              <option value={45}>45 мин</option>
              <option value={40}>40 мин</option>
              <option value={35}>35 мин</option>
              <option value={90}>90 мин</option>
            </select>
          </label>
        </div>

        <KspHeaderPanel hook={hook} onOpenKtp={onOpenKtp ? (id) => leave(() => onOpenKtp(id)) : undefined} />
        <KspTimingBar total={totalMinutes} target={doc.content.lessonDuration} report={report} onRebalance={rebalance} />
        <KspValidationBar report={report} />

        <div className="ksp-stages">
          {doc.content.stages.map((s, i) => (
            <KspStageCard key={s.id} stage={s} index={i} hook={hook} />
          ))}
        </div>

        <div className="filter-row ksp-add-stage">
          <select className="filter-select" value={newType} onChange={(e) => setNewType(e.target.value as KspStageType)}>
            {STAGE_TYPES.map((t) => <option key={t} value={t}>{STAGE_LABEL[t]}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => addStage(newType)}>Добавить этап</button>
        </div>

        <label className="ksp-field">
          <span>Домашнее задание</span>
          <textarea
            rows={3}
            value={doc.content.homework.text}
            onChange={(e) => patchContent((d) => ({
              ...d,
              content: { ...d.content, homework: { ...d.content.homework, text: e.target.value } },
            }))}
          />
        </label>
        <label className="ksp-field">
          <span>Способ проверки ДЗ</span>
          <input
            value={doc.content.homework.checkMethod}
            onChange={(e) => patchContent((d) => ({
              ...d,
              content: { ...d.content, homework: { ...d.content.homework, checkMethod: e.target.value } },
            }))}
          />
        </label>
      </div>
    </Panel>
  );
}

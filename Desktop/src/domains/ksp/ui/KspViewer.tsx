import { Panel } from "../../../components/ui";
import { STATUS_LABEL, statusTone } from "../kspModel";
import { useKspViewer } from "../useKspViewer";
import { KspExportBar } from "./KspExportBar";
import { KspTimingBar } from "./KspTimingBar";
import { KspValidationBar } from "./KspValidationBar";
import { KspViewSheet } from "./KspViewSheet";

export function KspViewer({
  kspId,
  onEdit,
  onClose,
  onOpenKtp,
}: {
  kspId: string;
  onEdit: () => void;
  onClose: () => void;
  onOpenKtp?: (planId: string) => void;
}) {
  const { doc, report, loading, busy, error, status, totalMinutes, exportFile } = useKspViewer(kspId);

  if (loading) return <div className="empty">Загрузка КСП…</div>;
  if (!doc) return <div className="flash-error">{error || "КСП не найден"}</div>;

  return (
    <Panel
      title="Просмотр КСП"
      subtitle="Форма приказа МОН РК № 130 · тема и цели из КТП"
      actions={
        <div className="row gap-sm">
          <button className="btn btn-sm" onClick={onClose}>К списку</button>
          {onOpenKtp && <button className="btn btn-sm" onClick={() => onOpenKtp(doc.ktpPlanId)}>Открыть в КТП</button>}
          <KspExportBar onExport={exportFile} busy={busy} />
          <button className="btn btn-sm btn-primary" onClick={onEdit}>Править</button>
        </div>
      }
    >
      <div className="panel-body ksp-viewer">
        {error && <div className="flash-error">{error}</div>}
        {status && <div className="flash-info">{status}</div>}
        <div className="ksp-status-line">
          <span className={`badge badge-${statusTone(doc.status)}`}>{STATUS_LABEL[doc.status]}</span>
          <span className="muted">Эталон {doc.content.lessonDuration} мин</span>
        </div>
        <KspTimingBar total={totalMinutes} target={doc.content.lessonDuration} report={report} />
        <KspValidationBar report={report} />
        <KspViewSheet doc={doc} />
      </div>
    </Panel>
  );
}

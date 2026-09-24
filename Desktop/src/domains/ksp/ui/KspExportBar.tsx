import type { KspExportFormat } from "../kspExport";

export function KspExportBar({
  onExport,
  busy,
}: {
  onExport: (format: KspExportFormat) => void;
  busy?: boolean;
}) {
  return (
    <div className="row gap-sm">
      <button className="btn btn-sm" disabled={busy} onClick={() => onExport("docx")}>Word</button>
      <button className="btn btn-sm" disabled={busy} onClick={() => onExport("xlsx")}>Excel</button>
      <button className="btn btn-sm" disabled={busy} onClick={() => onExport("pdf")}>PDF</button>
    </div>
  );
}

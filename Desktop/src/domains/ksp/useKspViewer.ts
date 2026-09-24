import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import type { KspDocument, KspValidationReport } from "../../types";
import { exportKspDocument, type KspExportFormat } from "./kspExport";

export function useKspViewer(kspId: string) {
  const [doc, setDoc] = useState<KspDocument | null>(null);
  const [report, setReport] = useState<KspValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const bundle = await api.getKspDocument(kspId);
      setDoc(bundle.document);
      setReport(bundle.report);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [kspId]);

  useEffect(() => { load(); }, [load]);

  const exportFile = async (format: KspExportFormat) => {
    if (!doc) return;
    setBusy(true);
    setError("");
    try {
      const path = await exportKspDocument(doc, format);
      if (path) setStatus("Файл сохранён.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const totalMinutes = (doc?.content.stages ?? []).reduce((s, x) => s + (Number(x.durationMinutes) || 0), 0);

  return { doc, report, loading, busy, error, status, totalMinutes, load, exportFile };
}

export type KspViewerHook = ReturnType<typeof useKspViewer>;

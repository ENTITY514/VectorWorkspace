import { useState } from "react";
import { api } from "../../services/api";

import { saveBinaryFile } from "../../lib/saver";
import { buildBackup, resolveImport, validateBackup } from "../../ktp/backup";
import { listTemplates, saveTemplate } from "../../ktp/templateLib";
import { SettingsSection } from "./SettingsSection";

export function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const exportData = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const [cards, tupDocs] = await Promise.all([api.listKtpPlans(), api.fetchTupDocuments()]);
      const plans = [];
      for (const c of cards) {
        plans.push(await api.getKtpPlan(c.id));
      }
      const manifest = buildBackup(plans, listTemplates(), tupDocs);
      const json = JSON.stringify(manifest, null, 2);
      const path = await saveBinaryFile(
        new Blob([json], { type: "application/json" }),
        "vectorworkspace-backup.json",
      );
      if (path) setMsg(`Экспортировано планов: ${plans.length}, шаблонов: ${listTemplates().length}.`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const importData = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await open({
        multiple: false,
        filters: [{ name: "Резервная копия", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const text = await invoke<string>("read_file_text", { path });
      const manifest = validateBackup(JSON.parse(text));
      const { plans, templates } = resolveImport(manifest);
      let imported = 0;
      for (const p of plans) {
        await api.saveKtpPlan(p);
        imported += 1;
      }
      for (const t of templates) saveTemplate(t);
      setMsg(`Импортировано планов: ${imported}, шаблонов: ${templates.length}.`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="Резервное копирование"
      subtitle="Экспорт всех данных (КТП, шаблоны, метаданные ТУП) в один JSON-файл и восстановление на другом устройстве."
    >
      <div className="form-row" style={{ alignItems: "flex-end" }}>
        <div className="form-field">
          <button className="btn btn-primary" disabled={busy} onClick={exportData}>
            {busy ? "Работаем…" : "Экспорт данных"}
          </button>
        </div>
        <div className="form-field">
          <button className="btn" disabled={busy} onClick={importData}>
            Импорт данных
          </button>
        </div>
      </div>
      {msg && <div className="form-hint">{msg}</div>}
      {err && <div className="flash-error" style={{ marginTop: 8 }}>{err}</div>}
    </SettingsSection>
  );
}

import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../../services/api";
import type { KspDocument } from "../../types";
import { exportKspExcel } from "./kspExcel";
import { kspFileStem } from "./kspModel";
import { exportKspWord } from "./kspWord";

export type KspExportFormat = "docx" | "xlsx" | "pdf";

export async function exportKspDocument(doc: KspDocument, format: KspExportFormat): Promise<string | null> {
  if (format === "docx") return exportKspWord(doc);
  if (format === "xlsx") return exportKspExcel(doc);
  const name = `${kspFileStem({ className: doc.className || doc.content.header.className, topic: doc.content.header.topic })}.pdf`;
  const path = await save({ defaultPath: name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return null;
  return api.exportKspPdf(doc.id, path);
}

export async function exportKspById(kspId: string, format: KspExportFormat): Promise<string | null> {
  const bundle = await api.getKspDocument(kspId);
  return exportKspDocument(bundle.document, format);
}

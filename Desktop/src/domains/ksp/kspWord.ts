import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../../services/api";
import type { KspDocument } from "../../types";
import { kspFileStem } from "./kspModel";

// Экспорт docx идёт через ядро (Tauri-команда export_ksp_docx):
// формулы OMML, форма № 130, имя файла по КТП.
export async function exportKspWord(doc: KspDocument): Promise<string | null> {
  const h = doc.content.header;
  const name = `${kspFileStem({ className: doc.className || h.className, topic: h.topic })}.docx`;
  const path = await save({ defaultPath: name, filters: [{ name: "Word", extensions: ["docx"] }] });
  if (!path) return null;
  return api.exportKspDocx(doc.id, path);
}

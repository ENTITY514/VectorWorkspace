// Сохранение файлов: в браузере через file-saver,
// в Tauri — через диалог сохранения + запись на диск.
import { saveAs } from "file-saver";

let inTauri = false;

export function detectTauri(): boolean {
  inTauri = "__TAURI_INTERNALS__" in window;
  return inTauri;
}

export async function saveBinaryFile(
  data: Blob | Uint8Array,
  suggestedName: string,
): Promise<string | null> {
  detectTauri();
  if (inTauri) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({ defaultPath: suggestedName });
      if (!path) return null;
      let bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
      await writeFile(path, bytes);
      return path;
    } catch (e) {
      // Фолбэк на браузерное сохранение
      saveAs(data instanceof Uint8Array ? new Blob([data]) : data, suggestedName);
      return suggestedName;
    }
  }
  saveAs(data instanceof Uint8Array ? new Blob([data]) : data, suggestedName);
  return suggestedName;
}
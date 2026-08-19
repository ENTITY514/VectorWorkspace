// Сохранение файлов: в браузере через file-saver,
// в Tauri — через диалог сохранения + запись на диск.
import { saveAs } from "file-saver";

let inTauri = false;

export function detectTauri(): boolean {
  inTauri = "__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window || "__TAURI__" in window;
  return inTauri;
}

export async function saveBinaryFile(
  data: Blob | Uint8Array,
  suggestedName: string,
): Promise<string | null> {
  detectTauri();
  if (inTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: suggestedName });
      if (!path) return null;
      let bytes: Uint8Array;
      if (data instanceof Uint8Array) {
        bytes = data;
      } else if (data instanceof Blob) {
        bytes = new Uint8Array(await data.arrayBuffer());
      } else if ((data as unknown) instanceof ArrayBuffer) {
        bytes = new Uint8Array(data as unknown as ArrayBuffer);
      } else if (typeof (data as any).arrayBuffer === "function") {
        bytes = new Uint8Array(await (data as any).arrayBuffer());
      } else {
        bytes = new Uint8Array(data as any);
      }
      
      await invoke("save_file", { path, bytes: Array.from(bytes) });
      alert("Файл сохранен: " + path);
      return path;
    } catch (e) {
      alert("Ошибка Tauri: " + String(e));
      // Фолбэк на браузерное сохранение
      saveAs(data instanceof Uint8Array ? new Blob([data as any]) : (data as any), suggestedName);
      return suggestedName;
    }
  }
  saveAs(data instanceof Uint8Array ? new Blob([data]) : data, suggestedName);
  return suggestedName;
}
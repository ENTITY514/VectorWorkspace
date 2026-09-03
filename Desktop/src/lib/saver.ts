import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

/**
 * Сохранение файла через нативный диалог.
 *
 * В webview Tauri браузерные загрузки (`<a download>`, `URL.createObjectURL`)
 * не работают: файл никуда не попадает и пользователь не получает никакого
 * сигнала. Единственный рабочий путь — диалог и файловый плагин.
 */

/** Расширение -> фильтр диалога, чтобы файл не сохранился без расширения. */
const FILTERS: Record<string, { name: string; extensions: string[] }> = {
  xlsx: { name: "Книга Excel", extensions: ["xlsx"] },
  docx: { name: "Документ Word", extensions: ["docx"] },
  csv: { name: "CSV", extensions: ["csv"] },
  json: { name: "JSON", extensions: ["json"] },
  pdf: { name: "PDF", extensions: ["pdf"] },
};

async function toBytes(data: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (typeof (data as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    return new Uint8Array(await (data as Blob).arrayBuffer());
  }
  return new Uint8Array(data as ArrayBufferLike);
}

/**
 * Показывает диалог сохранения и записывает файл.
 *
 * Возвращает путь либо `null`, если пользователь отменил выбор. Ошибки
 * записи пробрасываются: раньше они гасились в `alert`, и вызывающий код не
 * мог отличить отмену от сбоя, поэтому сообщал об успехе в обоих случаях.
 */
export async function saveBinaryFile(
  data: Blob | Uint8Array | ArrayBuffer,
  suggestedName: string,
): Promise<string | null> {
  const ext = suggestedName.split(".").pop()?.toLowerCase() ?? "";
  const filter = FILTERS[ext];

  const path = await save({
    defaultPath: suggestedName,
    filters: filter ? [filter] : undefined,
  });
  if (!path) return null;

  await writeFile(path, await toBytes(data));
  return path;
}

/** Сохранение текста (CSV, JSON) тем же путём. */
export async function saveTextFile(
  text: string,
  suggestedName: string,
): Promise<string | null> {
  return saveBinaryFile(new TextEncoder().encode(text), suggestedName);
}

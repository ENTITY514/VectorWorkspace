import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export async function saveBinaryFile(
  data: Blob | Uint8Array | ArrayBuffer,
  suggestedName: string,
): Promise<string | null> {
  try {
    const path = await save({ defaultPath: suggestedName });
    if (!path) return null;
    
    let bytes: Uint8Array;
    if (data instanceof Uint8Array) {
      bytes = data;
    } else if (data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer());
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (typeof (data as any).arrayBuffer === "function") {
      bytes = new Uint8Array(await (data as any).arrayBuffer());
    } else {
      bytes = new Uint8Array(data as any);
    }
    
    await writeFile(path, bytes);
    alert("Файл сохранен: " + path);
    return path;
  } catch (e) {
    alert("Ошибка сохранения: " + String(e));
    return null;
  }
}
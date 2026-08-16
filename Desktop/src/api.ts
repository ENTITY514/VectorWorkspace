import { invoke } from "@tauri-apps/api/core";
import type {
  HealthReport,
  LearningObjective,
  TupDocument,
  TupImportResult,
} from "./types";

const isTauri = "__TAURI_INTERNALS__" in window;

/**
 * Тонкий слой интерфейса к ядру. Никаких заглушек: ошибки пробрасываются наверх,
 * фронтенд не принимает решений и не прячет сбои ядра.
 */
async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri) {
    throw new Error("Ядро недоступно: приложение запущено вне окружения Tauri");
  }
  return invoke<T>(name, args);
}

export const api = {
  /** Целостность ядра: версия приложения и схемы БД. */
  async getHealth(): Promise<HealthReport> {
    return call<HealthReport>("health");
  },

  // ---- Нормативный базис (ТУП) ----
  /** Список документов ТУП (алгебра и геометрия — раздельные документы). */
  async listTupDocuments(): Promise<TupDocument[]> {
    return call<TupDocument[]>("list_tup_documents");
  },

  /** Цели обучения документа ТУП, отфильтрованные по классу. */
  async listObjectives(documentId: string, grade: number): Promise<LearningObjective[]> {
    return call<LearningObjective[]>("list_objectives", { documentId, grade });
  },

  /** Загрузка и разбор файла ТУП (.xlsx) с последующей заливкой в БД. */
  async importTup(path: string): Promise<TupImportResult[]> {
    return call<TupImportResult[]>("import_tup", { path });
  },

  /** Импорт ТУП из JSON-экспорта HTML-парсера (`tup_all_subjects_html.json`). */
  async importTupJson(path: string): Promise<TupImportResult[]> {
    return call<TupImportResult[]>("import_tup_json", { path });
  },
};

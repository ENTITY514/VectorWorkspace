import { invoke } from "@tauri-apps/api/core";
import type {
  HealthReport,
  InvariantReport,
  KtpPlan,
  KtpPlanCard,
  LearningObjective,
  RkCalendar,
  TupDocument,
  TupDocumentDetail,
  TupDocumentListItem,
  TupImportResult,
  TupSearchHit,
} from "./types";
import { SUBJECT_NAMES } from "./panels/SubjectNames";

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
  /** Список документов ТУП для главной страницы. */
  async fetchTupDocuments(): Promise<TupDocumentListItem[]> {
    const docs = await call<TupDocument[]>("list_tup_documents");
    return docs.map((d) => ({
      id: d.id,
      subjectName: SUBJECT_NAMES[d.subjectId] ?? d.subjectId,
      targetGrades: d.targetGrades,
      directionStr: d.direction === "emn" ? "ЕМН" : d.direction === "ogn" ? "ОГН" : "common",
      appendixNumber: d.appendixNumber,
      orderDate: d.orderDate,
      objectiveCount: d.objectiveCount,
      hasDsp: false, // заполнится из детального запроса
      language: d.language,
    }));
  },

  /** Детальная информация о документе ТУП. */
  async fetchTupDocument(id: string): Promise<TupDocumentDetail> {
    return call<TupDocumentDetail>("get_tup_document", { documentId: id });
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

  /** Полнотекстовый поиск по нормативному базису (FTS5). */
  async searchTup(query: string, limit?: number): Promise<TupSearchHit[]> {
    return call<TupSearchHit[]>("search_tup", { query, limit });
  },

  // ---- КТП (Фаза 4) ----
  /** Производственный календарь РК на учебный год. */
  async getRkCalendar(startYear: number): Promise<RkCalendar> {
    return call<RkCalendar>("get_rk_calendar_defaults", { startYear });
  },

  /** Список сохранённых планов КТП. */
  async listKtpPlans(): Promise<KtpPlanCard[]> {
    return call<KtpPlanCard[]>("list_ktp_plans");
  },

  /** Генерация и сохранение плана КТП из документа ТУП. */
  async generateKtpFromTup(
    documentId: string,
    grade: number,
    academicYear: string,
    startYear: number,
    daysOfWeek: number[],
  ): Promise<KtpPlan> {
    return call<KtpPlan>("generate_ktp_from_tup", {
      documentId,
      grade,
      academicYear,
      startYear,
      daysOfWeek,
    });
  },

  /** Пересчёт физических дат по календарю РК. */
  async updateKtpSchedule(planId: string, daysOfWeek: number[]): Promise<KtpPlan> {
    return call<KtpPlan>("update_ktp_schedule", { planId, daysOfWeek });
  },

  /** Валидация инвариантов оценивания плана. */
  async validateKtpInvariants(planId: string): Promise<InvariantReport> {
    return call<InvariantReport>("validate_ktp_invariants", { planId });
  },

  /** Полный план КТП по id (для загрузки в редактор). */
  async getKtpPlan(planId: string): Promise<KtpPlan> {
    return call<KtpPlan>("get_ktp_plan", { planId });
  },

  /** Сохранение плана КТП после правок в редакторе. */
  async saveKtpPlan(plan: KtpPlan): Promise<KtpPlan> {
    const { invariant: _inv, ...rest } = plan;
    return call<KtpPlan>("save_ktp_plan", { plan: rest });
  },
};

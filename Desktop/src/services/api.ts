import { invoke } from "@tauri-apps/api/core";
import type {
  ClassGroup,
  HealthReport,
  InvariantReport,
  KspBundle,
  KspCard,
  KspDocument,
  KspLessonOffer,
  KspValidationReport,
  KtpPlan,
  KtpPlanCard,
  ValueComponent,
  LearningObjective,
  OnboardSchoolInput,
  RkCalendar,
  SaveClassInput,
  SaveStaffInput,
  School,
  SchoolStaff,
  SchoolState,
  TeacherProfile,
  TupDocument,
  TupDocumentDetail,
  TupDocumentListItem,
  TupImportResult,
  TupSearchHit,
} from "../types";
import { subjectName } from "../panels/SubjectNames";

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
      subjectId: d.subjectId,
      subjectName: subjectName(d.subjectId, d.language),
      targetGrades: d.targetGrades,
      directionStr: d.direction,
      appendixNumber: d.appendixNumber,
      orderNumber: d.orderNumber,
      orderDate: d.orderDate,
      objectiveCount: d.objectiveCount,
      hasDsp: Boolean(d.hasDsp),
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

  /** Удаление плана КТП. КСП на уроках плана блокирует операцию. */
  async deleteKtpPlan(planId: string): Promise<void> {
    return call<void>("delete_ktp_plan", { planId });
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

  async listKspDocuments(): Promise<KspCard[]> {
    return call<KspCard[]>("list_ksp_documents");
  },
  async listKspLessonOffers(): Promise<KspLessonOffer[]> {
    return call<KspLessonOffer[]>("list_ksp_lesson_offers");
  },
  async listValueComponents(): Promise<ValueComponent[]> {
    return call<ValueComponent[]>("list_value_components");
  },
  async getKspDocument(kspId: string): Promise<KspBundle> {
    return call<KspBundle>("get_ksp_document", { kspId });
  },
  async createKspFromLesson(lessonId: string, className?: string, lessonDuration?: number): Promise<KspBundle> {
    return call<KspBundle>("create_ksp_from_lesson", { lessonId, className, lessonDuration });
  },
  async saveKspDocument(document: KspDocument): Promise<KspBundle> {
    return call<KspBundle>("save_ksp_document", { document });
  },
  async deleteKspDocument(kspId: string): Promise<void> {
    return call<void>("delete_ksp_document", { kspId });
  },
  async validateKspDocument(kspId: string): Promise<KspValidationReport> {
    return call<KspValidationReport>("validate_ksp_document", { kspId });
  },
  async rebalanceKspTime(kspId: string): Promise<KspBundle> {
    return call<KspBundle>("rebalance_ksp_time", { kspId });
  },
  async exportKspPdf(kspId: string, path: string): Promise<string> {
    return call<string>("export_ksp_pdf", { kspId, path });
  },
  async exportKspDocx(kspId: string, path: string): Promise<string> {
    return call<string>("export_ksp_docx", { kspId, path });
  },
  async kspMcpListTools(): Promise<{ name: string; description: string; mutating: boolean; inputSchema?: unknown }[]> {
    return call("mcp_list_tools");
  },
  async kspMcpInvoke(tool: string, params: Record<string, unknown>): Promise<unknown> {
    return call("mcp_invoke", { tool, params });
  },
  async mcpListTools(): Promise<{ name: string; description: string; mutating: boolean; inputSchema?: unknown }[]> {
    return call("mcp_list_tools");
  },
  async mcpInvoke(tool: string, params: Record<string, unknown>): Promise<unknown> {
    return call("mcp_invoke", { tool, params });
  },

  // ---- Идентичность (Фаза 2) ----
  /** Состояние учреждения: онбординг и экран «Настройки школы». */
  async getSchoolState(): Promise<SchoolState> {
    return call<SchoolState>("get_school_state");
  },

  /** Первый запуск: школа + профиль учителя + директор в одной транзакции. */
  async onboardSchool(input: OnboardSchoolInput): Promise<SchoolState> {
    return call<SchoolState>("onboard_school", { input });
  },

  /** Редактирование данных школы. */
  async saveSchool(input: { id: string; name: string; region?: string | null }): Promise<School> {
    return call<School>("save_school", { input });
  },

  /** Создание/обновление должности. Активация закрывает предыдущую ревизию роли. */
  async saveStaff(input: SaveStaffInput): Promise<SchoolStaff> {
    return call<SchoolStaff>("save_staff", { input });
  },

  /** Увольнение: должность помечается неактивной, valid_to = сегодня. */
  async deactivateStaff(staffId: string): Promise<SchoolStaff> {
    return call<SchoolStaff>("deactivate_staff", { staffId });
  },

  /** Профиль учителя (single-user, upsert). */
  async saveProfile(input: { fullName: string; category?: string | null }): Promise<TeacherProfile> {
    return call<TeacherProfile>("save_profile", { input });
  },

  /** Создание/обновление физического класса. */
  async saveClass(input: SaveClassInput): Promise<ClassGroup> {
    return call<ClassGroup>("save_class", { input });
  },

  /** Удаление физического класса. */
  async deleteClass(classId: string): Promise<void> {
    return call<void>("delete_class", { classId });
  },
};

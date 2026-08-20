// Глобальное резервное копирование (B3): единый JSON-пакет с schemaVersion и
// манифестом секций. Сейчас экспортируются КТП, шаблоны и метаданные ТУП;
// реестр секций расширяем — добавление новых секций не ломает формат.
//
// Импорт: валидация схемы, детект конфликтных id и merge-стратегия
// «создать копию» для планов (перегенерация id) и «пропустить» для шаблонов.

import { v4 as uuidv4 } from "uuid";
import type { KtpPlan, TupDocumentListItem } from "../types";
import type { KtpTemplate } from "./templateLib";

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupManifest {
  schemaVersion: number;
  exportedAt: string;
  sections: string[];
  plans: KtpPlan[];
  templates: KtpTemplate[];
  tupDocuments: TupDocumentListItem[];
}

export function buildBackup(
  plans: KtpPlan[],
  templates: KtpTemplate[],
  tupDocuments: TupDocumentListItem[],
): BackupManifest {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sections: ["plans", "templates", "tupDocuments"],
    plans,
    templates,
    tupDocuments,
  };
}

/** Проверка и нормализация входящего JSON-пакета. Бросает понятную ошибку. */
export function validateBackup(json: unknown): BackupManifest {
  if (!json || typeof json !== "object") {
    throw new Error("Файл не является объектом резервной копии.");
  }
  const m = json as Partial<BackupManifest>;
  if (typeof m.schemaVersion !== "number") {
    throw new Error("Файл повреждён: отсутствует schemaVersion.");
  }
  if (m.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Файл создан более новой версией (схема ${m.schemaVersion}), чем поддерживается (${BACKUP_SCHEMA_VERSION}). Обновите приложение.`,
    );
  }
  return {
    schemaVersion: m.schemaVersion ?? BACKUP_SCHEMA_VERSION,
    exportedAt: typeof m.exportedAt === "string" ? m.exportedAt : "",
    sections: Array.isArray(m.sections) ? m.sections : [],
    plans: Array.isArray(m.plans) ? m.plans : [],
    templates: Array.isArray(m.templates) ? m.templates : [],
    tupDocuments: Array.isArray(m.tupDocuments) ? m.tupDocuments : [],
  };
}

/** Применение пакета: перегенерация id для планов (создать копию), шаблоны как есть. */
export function resolveImport(manifest: BackupManifest): {
  plans: KtpPlan[];
  templates: KtpTemplate[];
} {
  const plans = manifest.plans.map((p) => ({ ...p, id: uuidv4(), status: "Draft" }));
  const templates = manifest.templates.map((t) => ({ ...t }));
  return { plans, templates };
}
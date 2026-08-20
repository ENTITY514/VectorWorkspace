// Библиотека шаблонов КТП (B2): сохранить план как шаблон и клонировать на
// параллельный класс одной кнопкой. Хранилище — localStorage (в Tauri это
// локальное хранилище приложения; «локальный файл» в терминах плана).
// Шаблон хранит вложенную модель (KtpPlan из types.ts) — при клонировании
// пересоздаются id, очищаются даты, меняется класс.

import { v4 as uuidv4 } from "uuid";
import type { KtpPlan } from "../types";

const STORAGE_KEY = "ktp_templates_v1";

export interface KtpTemplate {
  id: string;
  name: string;
  subjectId: string;
  grade: number;
  language: string;
  academicYear: string;
  createdAt: string;
  plan: KtpPlan;
}

export function listTemplates(): KtpTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KtpTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(t: KtpTemplate): KtpTemplate[] {
  const all = listTemplates().filter((x) => x.id !== t.id);
  all.push(t);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function deleteTemplate(id: string): KtpTemplate[] {
  const all = listTemplates().filter((x) => x.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

/** Клон шаблона для другого класса: новые id, пустые даты, черновик. */
export function clonePlanForGrade(template: KtpTemplate, newGrade: number, academicYear: string): KtpPlan {
  const src = template.plan;
  const id = uuidv4();
  const quarters = src.quarters.map((q) => {
    const quarterId = uuidv4();
    return {
      ...q,
      id: quarterId,
      ktpId: id,
      lessons: q.lessons.map((l) => ({
        ...l,
        id: uuidv4(),
        quarterId,
        plannedDate: null,
        isCancelled: false,
      })),
    };
  });
  return {
    ...src,
    id,
    grade: newGrade,
    academicYear,
    status: "Draft",
    createdAt: "",
    updatedAt: "",
    quarters,
  };
}
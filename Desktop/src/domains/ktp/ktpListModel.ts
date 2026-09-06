import type { KtpPlanCard } from "../../types";
import { subjectName } from "../../panels/SubjectNames";

export const WEEKDAYS = [
  { num: 1, label: "Пн" },
  { num: 2, label: "Вт" },
  { num: 3, label: "Ср" },
  { num: 4, label: "Чт" },
  { num: 5, label: "Пт" },
  { num: 6, label: "Сб" },
];

export const STATUS_LABEL: Record<string, string> = {
  Draft: "Черновик",
  Validating: "На проверке",
  Approved: "Утверждён",
  Archived: "Архив",
};

export function defaultAcademicYear(d = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function startYearOf(academicYear: string): number {
  const n = Number(academicYear.split("-")[0]);
  return Number.isFinite(n) ? n : new Date().getFullYear();
}

export function academicYearOptions(current: string): string[] {
  const start = startYearOf(current);
  return [`${start - 1}-${start}`, `${start}-${start + 1}`, `${start + 1}-${start + 2}`];
}

export function filterKtpPlans(
  plans: KtpPlanCard[],
  opts: { query: string; grade: number | null; status: string; year: string },
): KtpPlanCard[] {
  const q = opts.query.trim().toLowerCase();
  return plans.filter((p) => {
    if (opts.grade != null && p.grade !== opts.grade) return false;
    if (opts.status && p.status !== opts.status) return false;
    if (opts.year && p.academicYear !== opts.year) return false;
    if (!q) return true;
    const name = subjectName(p.subjectId, p.language).toLowerCase();
    const hay = `${p.subjectId} ${name} ${p.grade} ${p.language} ${p.academicYear} ${STATUS_LABEL[p.status] ?? p.status}`.toLowerCase();
    return hay.includes(q);
  });
}

export function statusTone(status: string): string {
  switch (status) {
    case "Approved": return "green";
    case "Validating": return "amber";
    case "Archived": return "gray";
    default: return "blue";
  }
}

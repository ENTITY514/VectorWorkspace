// Поиск нормативного источника ТУП для пары «предмет × класс».
// Реестр строится из данных `tup_documents` (заполнены из Materials/test_ru.json:
// order_number, order_date, appendix_number). Отсутствие пары → null,
// универсальная ссылка не подставляется (A1).

import type { TupDocumentListItem } from "../types";
import { parseGrades } from "./grades";
import { directionWhy, normalizeDirection } from "../domains/tup/labels";

function rankDirection(d: string): number {
  switch (normalizeDirection(d)) {
    case "emn":
      return 0;
    case "common":
      return 1;
    default:
      return 2;
  }
}

function candidates(
  docs: TupDocumentListItem[],
  subjectId: string,
  grade: number,
  language?: string,
): TupDocumentListItem[] {
  const gradeOk = (d: TupDocumentListItem) =>
    d.subjectId === subjectId && parseGrades(d.targetGrades).includes(grade);
  const byLang = language
    ? docs.filter(
        (d) => gradeOk(d) && d.language.toUpperCase() === language.toUpperCase(),
      )
    : [];
  const pool = byLang.length > 0 ? byLang : docs.filter(gradeOk);
  return [...pool].sort((a, b) => rankDirection(a.directionStr) - rankDirection(b.directionStr));
}

export function matchSourceDoc(
  docs: TupDocumentListItem[],
  subjectId: string,
  grade: number,
  language?: string,
): TupDocumentListItem | null {
  return candidates(docs, subjectId, grade, language)[0] ?? null;
}

export function sourceDocLabel(doc: TupDocumentListItem): string {
  const dir = normalizeDirection(doc.directionStr);
  const variant = dir === "common" ? "" : ` · ${directionWhy(doc.directionStr)}`;
  return `Источник: приказ МОН РК от ${doc.orderDate} № ${doc.orderNumber} · приложение ${doc.appendixNumber}${variant}`;
}
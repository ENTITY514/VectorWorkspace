// Поиск нормативного источника ТУП для пары «предмет × класс».
// Реестр строится из данных `tup_documents` (заполнены из Materials/test_ru.json:
// order_number, order_date, appendix_number). Отсутствие пары → null,
// универсальная ссылка не подставляется (A1).

import type { TupDocumentListItem } from "../types";
import { parseGrades } from "./grades";

export function matchSourceDoc(
  docs: TupDocumentListItem[],
  subjectId: string,
  grade: number,
  language?: string,
): TupDocumentListItem | null {
  if (language) {
    const exact = docs.find(
      (d) =>
        d.subjectId === subjectId &&
        d.language.toUpperCase() === language.toUpperCase() &&
        parseGrades(d.targetGrades).includes(grade),
    );
    if (exact) return exact;
  }
  return (
    docs.find(
      (d) => d.subjectId === subjectId && parseGrades(d.targetGrades).includes(grade),
    ) ?? null
  );
}

export function sourceDocLabel(doc: TupDocumentListItem): string {
  return `Источник: приказ МОН РК от ${doc.orderDate} № ${doc.orderNumber} · приложение ${doc.appendixNumber}`;
}
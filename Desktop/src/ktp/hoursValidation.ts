// Сервис валидации часов (A7): сверка нормы предмета с фактическим планом.
// Чистые функции — без React/БД.
//
// Логика: дни проведения → уроков/нед; 1, 2, 4 четверти — 8 учебных недель,
// 3-я — 10 недель. «Должно» = недели × уроков/нед (при 3 ч/нед: 24+24+30+24=102).
// «Запланировано» — уроки четверти с проставленной датой.
// «Фактически» — запланированные минус объединения уроков (2 урока на одну дату).

import { KtpPlan, LessonRowType } from "./model/types";

export const QUARTER_WEEKS: readonly number[] = [8, 8, 10, 8];

const MONTHS_RU = [
  "янв.", "фев.", "мар.", "апр.", "мая", "июн.",
  "июл.", "авг.", "сен.", "окт.", "нояб.", "дек.",
];

/** Короткая русская дата «25 окт.» из ISO «2026-10-25». */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_RU[m - 1] ?? m}`;
}

export interface QuarterHoursReport {
  quarterNumber: number;
  should: number;
  planned: number;
  actual: number;
  merges: { date: string; count: number }[];
  ok: boolean;
  message: string;
}

export interface HoursValidationReport {
  hoursPerWeek: number;
  norm: number;
  quarters: QuarterHoursReport[];
  totalShould: number;
  totalPlanned: number;
  totalActual: number;
  overallOk: boolean;
  overallMessage: string;
}

/** Разбивка плоского плана по четвертям (по заголовкам QUARTER_HEADER). */
export function splitByQuarters(plan: KtpPlan): KtpPlan[] {
  const quarters: KtpPlan[] = [];
  let current: KtpPlan = [];
  for (const l of plan) {
    if (l.rowType === LessonRowType.QUARTER_HEADER) {
      if (current.length) quarters.push(current);
      current = [];
    } else {
      current.push(l);
    }
  }
  if (current.length) quarters.push(current);
  return quarters;
}

export function validateHours(plan: KtpPlan, hoursPerWeek: number): HoursValidationReport {
  const quarters = splitByQuarters(plan);
  const report: QuarterHoursReport[] = quarters.map((lessons, i) => {
    const quarterNumber = i + 1;
    const should = (QUARTER_WEEKS[i] ?? 8) * hoursPerWeek;
    const dated = lessons.filter((l) => Boolean(l.date));
    const planned = dated.length;

    const byDate = new Map<string, number>();
    for (const l of dated) {
      byDate.set(l.date, (byDate.get(l.date) ?? 0) + 1);
    }
    const merges = Array.from(byDate.entries())
      .filter(([, count]) => count > 1)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const mergedAway = merges.reduce((s, m) => s + (m.count - 1), 0);
    const actual = planned - mergedAway;

    const deficit = should - planned;
    const parts: string[] = [];
    if (deficit > 0) parts.push(`не хватает ${deficit} урок${pluralRu(deficit)}`);
    if (deficit < 0) parts.push(`запланировано на ${-deficit} урок${pluralRu(-deficit)} больше`);
    if (merges.length) {
      parts.push(
        `${merges.length} объединени${merges.length === 1 ? "е" : "я"}: ${merges
          .map((m) => formatShortDate(m.date))
          .join(", ")}`,
      );
    }

    let message = `должно ${should}, запланировано ${planned}, фактически ${actual}`;
    if (parts.length) message += ` — ${parts.join(", ")}`;

    return {
      quarterNumber,
      should,
      planned,
      actual,
      merges,
      ok: deficit === 0,
      message,
    };
  });

  const totalShould = report.reduce((s, q) => s + q.should, 0);
  const totalPlanned = report.reduce((s, q) => s + q.planned, 0);
  const totalActual = report.reduce((s, q) => s + q.actual, 0);
  const overallOk = totalActual === totalShould && totalPlanned >= totalShould;
  const overallMessage = overallOk
    ? `Сходится: ${totalShould} ч. по норме и по плану.`
    : `Не сходится: норма ${totalShould} ч., фактически ${totalActual} ч. Проверьте введённые часы и распределение уроков по неделям.`;

  return {
    hoursPerWeek,
    norm: totalShould,
    quarters: report,
    totalShould,
    totalPlanned,
    totalActual,
    overallOk,
    overallMessage,
  };
}

function pluralRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "а";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "а";
  return "ов";
}
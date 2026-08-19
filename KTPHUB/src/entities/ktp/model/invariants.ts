// src/entities/ktp/model/invariants.ts
// Инварианты КТП (Фаза 4). Чистые функции без зависимостей от Redux и БД —
// зеркало Rust-реализации Desktop/src-tauri/src/domain/invariants.rs
// и validate_invariants (ktp_service.rs).

import { IKtpLesson, KtpPlan, LessonRowType } from "./types";

export interface FrCheck {
  ok: boolean;
  message: string;
}

export interface InvariantCheck {
  quarterNumber: number;
  fr22: FrCheck;
  fr23: FrCheck;
}

export interface InvariantReport {
  valid: boolean;
  checks: InvariantCheck[];
}

/** Разбивает плоский план КТП на четверти по строкам QUARTER_HEADER. */
export const splitPlanIntoQuarters = (plan: KtpPlan): IKtpLesson[][] => {
  const quarters: IKtpLesson[][] = [];
  let current: IKtpLesson[] | null = null;
  for (const lesson of plan) {
    if (lesson.rowType === LessonRowType.QUARTER_HEADER) {
      current = [];
      quarters.push(current);
    } else if (current) {
      current.push(lesson);
    }
  }
  return quarters;
};

/**
 * FR-2.2: Index(Soch) - Index(Last_Sor) = 2.
 * Между последним СОР перед СОЧ и СОЧ должен быть ровно 1 промежуточный урок.
 * Индексы — логические номера уроков внутри четверти (1-based).
 */
export const checkFr22 = (lessons: IKtpLesson[]): FrCheck => {
  const sochIndex = lessons
    .map((l, i) => ({ l, index: i + 1 }))
    .filter((x) => x.l.rowType === LessonRowType.SOCH)
    .map((x) => x.index)
    .reduce<number | undefined>(
      (acc, idx) => (acc === undefined ? idx : Math.min(acc, idx)),
      undefined
    );

  if (sochIndex === undefined) {
    return { ok: true, message: "нет СОЧ — инвариант не применим" };
  }

  const lastSorBefore = lessons
    .map((l, i) => ({ l, index: i + 1 }))
    .filter((x) => x.l.rowType === LessonRowType.SOR && x.index < sochIndex)
    .map((x) => x.index)
    .reduce<number | undefined>(
      (acc, idx) => (acc === undefined ? idx : Math.max(acc, idx)),
      undefined
    );

  if (lastSorBefore === undefined) {
    return { ok: true, message: "СОЧ без СОР — инвариант не применим" };
  }

  if (sochIndex - lastSorBefore === 2) {
    return {
      ok: true,
      message: `СОР (урок ${lastSorBefore}) → буфер → СОЧ (урок ${sochIndex}): дистанция соблюдена`,
    };
  }
  return {
    ok: false,
    message: `последний СОР на уроке ${lastSorBefore}, СОЧ на ${sochIndex}: нужно ровно 1 промежуточный урок (разница 2)`,
  };
};

/**
 * FR-2.3: TotalLessons_quarter - Index(Soch) >= HoursPerWeek.
 * После СОЧ до конца четверти должно остаться не меньше недельной нагрузки.
 * indexSoch — 1-based номер СОЧ; 0 означает отсутствие СОЧ.
 */
export const checkFr23 = (
  totalLessons: number,
  indexSoch: number,
  hoursPerWeek: number
): FrCheck => {
  if (indexSoch <= 0) {
    return { ok: true, message: "нет СОЧ — инвариант не применим" };
  }
  const buffer = totalLessons - indexSoch;
  if (buffer >= hoursPerWeek) {
    return {
      ok: true,
      message: `после СОЧ ${buffer} уроков ≥ ${hoursPerWeek} в неделю`,
    };
  }
  return {
    ok: false,
    message: `после СОЧ только ${buffer} уроков, требуется ≥ ${hoursPerWeek}`,
  };
};

/** Проверяет FR-2.2 и FR-2.3 для всех четвертей плана. */
export const validateKtpPlanInvariants = (
  plan: KtpPlan,
  hoursPerWeek: number
): InvariantReport => {
  const quarters = splitPlanIntoQuarters(plan);
  const checks: InvariantCheck[] = quarters.map((lessons, qIdx) => {
    const fr22 = checkFr22(lessons);
    const sochIndex =
      lessons.findIndex((l) => l.rowType === LessonRowType.SOCH) + 1;
    const fr23 = checkFr23(lessons.length, sochIndex, hoursPerWeek);
    return {
      quarterNumber: qIdx + 1,
      fr22,
      fr23,
    };
  });
  return {
    valid: checks.every((c) => c.fr22.ok && c.fr23.ok),
    checks,
  };
};
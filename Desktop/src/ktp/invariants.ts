// Клиентская проверка FR-2.2 / FR-2.3 — та же логика, что `validate_invariants` в Rust.
// Нужна в редакторе: после локальных правок отчёт из БД устаревает до сохранения.

import type { InvariantReport, QuarterCheck } from "../types";
import { LessonRowType, type KtpPlan } from "./model/types";
import { splitByQuarters } from "./hoursValidation";

function hoursAt(hoursPerWeek: number | readonly number[], index: number): number {
  if (typeof hoursPerWeek === "number") return Math.max(1, hoursPerWeek);
  return Math.max(1, hoursPerWeek[index] ?? hoursPerWeek[hoursPerWeek.length - 1] ?? 1);
}

export function checkInvariants(
  plan: KtpPlan,
  hoursPerWeek: number | readonly number[],
): InvariantReport {
  const quarters = splitByQuarters(plan);
  const checks: QuarterCheck[] = [];
  let valid = true;

  quarters.forEach((lessons, i) => {
    if (lessons.length === 0) return;
    const total = lessons.length;
    const hours = hoursAt(hoursPerWeek, i);
    const soch = lessons.findIndex((l) => l.rowType === LessonRowType.SOCH);
    const lastSor = (() => {
      for (let j = lessons.length - 1; j >= 0; j--) {
        if (lessons[j].rowType === LessonRowType.SOR) return j;
      }
      return -1;
    })();

    let fr22Ok = true;
    let fr22Message = "нет контрольных срезов";
    if (soch >= 0 && lastSor >= 0) {
      if (soch - lastSor === 2) {
        fr22Message = "СОР → буфер → СОЧ: дистанция соблюдена";
      } else {
        fr22Ok = false;
        fr22Message = `последний СОР на уроке ${lastSor + 1}, СОЧ на ${soch + 1}: нужно ровно 1 промежуточный урок`;
      }
    } else if (soch >= 0) {
      fr22Message = "СОЧ без СОР — инвариант не применим";
    }

    let fr23Ok = true;
    let fr23Message = "нет СОЧ";
    if (soch >= 0) {
      const buffer = total - (soch + 1);
      if (buffer >= hours) {
        fr23Message = `после СОЧ ${buffer} уроков ≥ ${hours} в неделю`;
      } else {
        fr23Ok = false;
        fr23Message = `после СОЧ только ${buffer} уроков, требуется ≥ ${hours}`;
      }
    }

    if (!fr22Ok || !fr23Ok) valid = false;
    checks.push({
      quarterNumber: i + 1,
      fr22Ok,
      fr22Message,
      fr23Ok,
      fr23Message,
    });
  });

  return { valid, checks };
}

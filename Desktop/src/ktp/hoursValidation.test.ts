import { describe, expect, it } from "vitest";
import { validateHours, splitByQuarters, QUARTER_WEEKS, formatShortDate } from "./hoursValidation";
import type { IKtpLesson, KtpPlan } from "./model/types";
import { LessonRowType } from "./model/types";

function qHeader(id: string, hours: number): IKtpLesson {
  return {
    id,
    lessonNumber: 0,
    hoursInSection: 0,
    sectionName: "1-я четверть · 3 ч/нед",
    lessonTopic: "",
    objectives: [],
    hours,
    date: "",
    notes: "",
    rowType: LessonRowType.QUARTER_HEADER,
  };
}

function std(id: string, date: string): IKtpLesson {
  return {
    id,
    lessonNumber: 0,
    hoursInSection: 1,
    sectionName: "Раздел 1",
    lessonTopic: "Тема",
    objectives: [{ id: "1.1", description: "цель" }],
    hours: 1,
    date,
    notes: "",
    rowType: LessonRowType.STANDARD,
  };
}

function planOfQuarterCounts(counts: number[]): KtpPlan {
  const plan: KtpPlan = [];
  counts.forEach((n, qi) => {
    plan.push(qHeader(`q${qi + 1}`, n));
    for (let i = 0; i < n; i++) {
      plan.push(std(`q${qi + 1}-${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`));
    }
  });
  return plan;
}

describe("splitByQuarters", () => {
  it("делит план по заголовкам четвертей", () => {
    const quarters = splitByQuarters(planOfQuarterCounts([3, 2]));
    expect(quarters).toHaveLength(2);
    expect(quarters[0]).toHaveLength(3);
    expect(quarters[1]).toHaveLength(2);
  });
});

describe("validateHours (A7)", () => {
  it("контрольный расчёт 3·8·3 + 3·10 = 102 сходится", () => {
    const report = validateHours(planOfQuarterCounts([24, 24, 30, 24]), 3);
    expect(report.norm).toBe(102);
    expect(report.totalActual).toBe(102);
    expect(report.totalPlanned).toBe(102);
    expect(report.overallOk).toBe(true);
    expect(report.quarters.map((q) => q.should)).toEqual([24, 24, 30, 24]);
  });

  it("считает «должно» по неделям четвертей", () => {
    expect(QUARTER_WEEKS).toEqual([8, 8, 10, 8]);
    const report = validateHours(planOfQuarterCounts([16, 16, 20, 16]), 2);
    expect(report.quarters.map((q) => q.should)).toEqual([16, 16, 20, 16]);
  });

  it("детектит нехватку уроков и формирует сообщение", () => {
    const report = validateHours(planOfQuarterCounts([20, 24, 30, 24]), 3);
    const q1 = report.quarters[0];
    expect(q1.ok).toBe(false);
    expect(q1.planned).toBe(20);
    expect(q1.message).toContain("не хватает 4");
    expect(report.overallOk).toBe(false);
  });

  it("считает объединения уроков (2 урока на одну дату) и «фактически»", () => {
    const plan = planOfQuarterCounts([24, 24, 30, 24]);
    // Объединяем два урока первой четверти на одну дату.
    const q1 = plan.findIndex((l) => l.id === "q1-1");
    const q2 = plan.findIndex((l) => l.id === "q1-2");
    plan[q2] = { ...plan[q2], date: plan[q1].date };
    const report = validateHours(plan, 3);
    const q = report.quarters[0];
    expect(q.planned).toBe(24);
    expect(q.actual).toBe(23);
    expect(q.merges).toHaveLength(1);
    expect(q.message).toContain("объединени");
  });

  it("не считает пустые даты", () => {
    const plan = planOfQuarterCounts([24, 24, 30, 24]);
    const report = validateHours(plan.map((l) => (l.rowType === LessonRowType.QUARTER_HEADER ? l : { ...l, date: "" })), 3);
    expect(report.totalPlanned).toBe(0);
    expect(report.overallOk).toBe(false);
  });
});

describe("formatShortDate", () => {
  it("форматирует ISO в «25 окт.»", () => {
    expect(formatShortDate("2026-10-25")).toBe("25 окт.");
    expect(formatShortDate("2026-12-16")).toBe("16 дек.");
  });
});
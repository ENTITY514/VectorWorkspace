import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { LessonRowType, type IKtpLesson, type KtpPlan } from "./model/types";

function row(partial: Partial<IKtpLesson> & { rowType: LessonRowType }): IKtpLesson {
  return {
    id: partial.id ?? crypto.randomUUID(),
    lessonNumber: 0,
    hoursInSection: 1,
    sectionName: "Раздел",
    lessonTopic: "Тема",
    objectives: [],
    hours: 1,
    date: "",
    notes: "",
    ...partial,
  };
}

describe("checkInvariants", () => {
  it("принимает СОР → буфер → СОЧ и хвост ≥ ч/нед", () => {
    const plan: KtpPlan = [
      row({ rowType: LessonRowType.QUARTER_HEADER, sectionName: "1-я", hours: 0 }),
      row({ rowType: LessonRowType.STANDARD }),
      row({ rowType: LessonRowType.SOR }),
      row({ rowType: LessonRowType.STANDARD }),
      row({ rowType: LessonRowType.SOCH }),
      row({ rowType: LessonRowType.REPETITION }),
      row({ rowType: LessonRowType.REPETITION }),
    ];
    const report = checkInvariants(plan, 2);
    expect(report.valid).toBe(true);
    expect(report.checks[0].fr22Ok).toBe(true);
    expect(report.checks[0].fr23Ok).toBe(true);
  });

  it("ломает FR-2.2 если между СОР и СОЧ нет ровно одного урока", () => {
    const plan: KtpPlan = [
      row({ rowType: LessonRowType.QUARTER_HEADER, sectionName: "1-я", hours: 0 }),
      row({ rowType: LessonRowType.SOR }),
      row({ rowType: LessonRowType.SOCH }),
      row({ rowType: LessonRowType.REPETITION }),
    ];
    const report = checkInvariants(plan, 1);
    expect(report.valid).toBe(false);
    expect(report.checks[0].fr22Ok).toBe(false);
  });
});

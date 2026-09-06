import { describe, expect, it } from "vitest";
import { totalHoursOf } from "./fromDb";
import { LessonRowType, type KtpPlan } from "./model/types";

describe("totalHoursOf", () => {
  it("не считает шапку четверти — иначе годовые часы удваиваются", () => {
    const plan: KtpPlan = [
      {
        id: "h1",
        lessonNumber: 0,
        hoursInSection: 0,
        sectionName: "1-я четверть · 3 ч/нед",
        lessonTopic: "",
        objectives: [],
        hours: 2,
        date: "",
        notes: "",
        rowType: LessonRowType.QUARTER_HEADER,
      },
      {
        id: "l1",
        lessonNumber: 1,
        hoursInSection: 1,
        sectionName: "Раздел",
        lessonTopic: "Тема",
        objectives: [],
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.STANDARD,
      },
      {
        id: "l2",
        lessonNumber: 2,
        hoursInSection: 1,
        sectionName: "Раздел",
        lessonTopic: "Тема 2",
        objectives: [],
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.STANDARD,
      },
    ];
    expect(totalHoursOf(plan)).toBe(2);
  });
});

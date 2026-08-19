// src/entities/ktp/model/lib.test.ts
// Тесты генерации плана КТП из ТУП (Фаза 4).

import { transformTupToKtp, renumberPlan } from "./lib";
import { AcademicPlan } from "../../circulumPlan/model/types";
import { LessonRowType } from "./types";

const buildTup = (): AcademicPlan => [
  {
    name: "1 четверть",
    repetitionInfo: ["Повторение: алгебра 5 кл."],
    sections: [
      {
        name: "Раздел 1",
        topics: [
          {
            name: "Тема 1",
            objectives: [
              { id: "5.1.1.1", description: "уметь считать" },
              { id: "5.1.1.2", description: "уметь сравнивать" },
            ],
          },
          {
            name: "Тема 2",
            objectives: [{ id: "5.1.1.3", description: "уметь складывать" }],
          },
        ],
      },
    ],
  },
];

describe("transformTupToKtp", () => {
  test("строит план: повторение → темы → СОЧ → 2 повторения", () => {
    const plan = transformTupToKtp(buildTup());

    // 1 header + 1 repetition + 3 темы (2+1 по целям) + СОЧ + 2 повторения
    expect(plan).toHaveLength(1 + 1 + 3 + 1 + 2);

    expect(plan[0].rowType).toBe(LessonRowType.QUARTER_HEADER);
    expect(plan[1].rowType).toBe(LessonRowType.REPETITION);

    const soch = plan.find((l) => l.rowType === LessonRowType.SOCH);
    expect(soch).toBeDefined();
    expect(soch!.lessonTopic).toBe("СОЧ");

    const repetitions = plan.filter(
      (l) => l.rowType === LessonRowType.REPETITION
    );
    expect(repetitions).toHaveLength(1 + 2);
  });

  test("каждая цель становится отдельным уроком", () => {
    const plan = transformTupToKtp(buildTup());
    const standard = plan.filter((l) => l.rowType === LessonRowType.STANDARD);
    expect(standard).toHaveLength(3);
    expect(standard[0].objectives[0].description).toBe("уметь считать");
  });

  test("уроки нумеруются последовательно (начиная с 1)", () => {
    const plan = transformTupToKtp(buildTup());
    const numbered = plan.filter((l) => l.lessonNumber > 0);
    numbered.forEach((l, i) => expect(l.lessonNumber).toBe(i + 1));
  });
});

describe("renumberPlan", () => {
  test("перенумеровывает уроки, пропуская заголовки четвертей", () => {
    const plan = transformTupToKtp(buildTup());
    const renumbered = renumberPlan(plan);
    const numbered = renumbered.filter((l) => l.lessonNumber > 0);
    numbered.forEach((l, i) => expect(l.lessonNumber).toBe(i + 1));
    const headers = renumbered.filter(
      (l) => l.rowType === LessonRowType.QUARTER_HEADER
    );
    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((h) => expect(h.lessonNumber).toBe(0));
  });
});
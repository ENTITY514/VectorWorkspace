import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { addSorToPlan, mergeObjectivesWithNext, reorderPlan } from "./editorModel";
import { HistoryMachine } from "./history";
import type { IKtpLesson, KtpPlan } from "./model/types";
import { LessonRowType } from "./model/types";

function lesson(partial: Partial<IKtpLesson> & { sectionName: string; lessonTopic: string }): IKtpLesson {
  return {
    id: partial.id ?? uuidv4(),
    lessonNumber: 0,
    hoursInSection: 1,
    objectives: partial.objectives ?? [],
    hours: 1,
    date: "",
    notes: "",
    rowType: partial.rowType ?? LessonRowType.STANDARD,
    ...partial,
  };
}

function quarterHeader(id: string): IKtpLesson {
  return {
    id,
    lessonNumber: 0,
    hoursInSection: 0,
    sectionName: "1-я четверть · 3 ч/нед",
    lessonTopic: "",
    objectives: [],
    hours: 9,
    date: "",
    notes: "",
    rowType: LessonRowType.QUARTER_HEADER,
  };
}

function makePlan(): KtpPlan {
  return [
    quarterHeader("q1"),
    lesson({ id: "a", sectionName: "Раздел 1", lessonTopic: "Тема 1", objectives: [{ id: "1.1", description: "цель 1" }] }),
    lesson({ id: "b", sectionName: "Раздел 1", lessonTopic: "Тема 2", objectives: [{ id: "1.2", description: "цель 2" }] }),
    lesson({ id: "c", sectionName: "Раздел 2", lessonTopic: "Тема 3", objectives: [{ id: "2.1", description: "цель 3" }] }),
    quarterHeader("q2"),
    lesson({ id: "d", sectionName: "Раздел 3", lessonTopic: "Тема 4", objectives: [{ id: "3.1", description: "цель 4" }] }),
  ];
}

describe("reorderPlan (A2: только внутри четверти и раздела)", () => {
  it("разрешает перенос внутри раздела", () => {
    const res = reorderPlan(makePlan(), "a", "b");
    expect(res.error).toBeUndefined();
    const order = res.plan.map((l) => l.id);
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
  });

  it("запрещает перенос между разделами одной четверти", () => {
    const plan = makePlan();
    const res = reorderPlan(plan, "a", "c");
    expect(res.error).toContain("другой раздел");
    expect(res.plan).toEqual(plan);
  });

  it("запрещает перенос между четвертями", () => {
    const plan = makePlan();
    const res = reorderPlan(plan, "c", "d");
    expect(res.error).toContain("другую четверть");
    expect(res.plan).toEqual(plan);
  });
});

describe("addSorToPlan (A4 + A10)", () => {
  it("СОР дублирует тему и цель последнего обычного урока раздела", () => {
    const res = addSorToPlan(makePlan(), "b");
    const sor = res.find((l) => l.rowType === LessonRowType.SOR);
    expect(sor).toBeDefined();
    expect(sor!.lessonTopic).toBe("Тема 2");
    expect(sor!.objectives).toEqual([{ id: "1.2", description: "цель 2" }]);
    expect(sor!.lessonTopic).not.toContain("СОР №");
  });

  it("сразу после СОР идёт дубликат последнего урока (тип STANDARD)", () => {
    const res = addSorToPlan(makePlan(), "b");
    const idx = res.findIndex((l) => l.rowType === LessonRowType.SOR);
    const next = res[idx + 1];
    expect(next.rowType).toBe(LessonRowType.STANDARD);
    expect(next.lessonTopic).toBe("Тема 2");
    expect(next.objectives).toEqual([{ id: "1.2", description: "цель 2" }]);
  });
});

describe("mergeObjectivesWithNext (A11)", () => {
  it("объединяет цели следующего урока в текущий и удаляет его", () => {
    const plan: KtpPlan = [
      quarterHeader("q1"),
      lesson({ id: "a", sectionName: "Раздел 1", lessonTopic: "Тема 1", objectives: [{ id: "1.1", description: "цель 1" }] }),
      lesson({ id: "b", sectionName: "Раздел 1", lessonTopic: "Тема 1", objectives: [{ id: "1.2", description: "цель 2" }] }),
    ];
    const res = mergeObjectivesWithNext(plan, "a");
    const merged = res.find((l) => l.id === "a");
    expect(merged!.objectives.map((o) => o.id)).toEqual(["1.1", "1.2"]);
    expect(res.filter((l) => l.id === "b")).toHaveLength(0);
    // Нумерация корректна: у оставшегося урока номер 1.
    const standard = res.find((l) => l.id === "a");
    expect(standard!.lessonNumber).toBe(1);
  });
});

describe("HistoryMachine (B1)", () => {
  it("откатывает и повторяет последовательность действий", () => {
    const h = new HistoryMachine<number>(0);
    h.commit(1, "шаг 1");
    h.commit(2, "шаг 2");
    expect(h.present).toBe(2);
    expect(h.canUndo).toBe(true);

    expect(h.undo()).toBe(1);
    expect(h.present).toBe(1);
    expect(h.canRedo).toBe(true);

    expect(h.redo()).toBe(2);
    expect(h.present).toBe(2);

    h.commit(3, "шаг 3");
    expect(h.canRedo).toBe(false); // новое действие сбрасывает future
  });

  it("фиксирует снапшот плана из 300 уроков быстро", () => {
    const plan: KtpPlan = [];
    for (let i = 0; i < 300; i++) {
      plan.push(
        lesson({ sectionName: `Раздел ${Math.floor(i / 5)}`, lessonTopic: `Тема ${i}` }),
      );
    }
    const h = new HistoryMachine<KtpPlan>(plan);
    const start = performance.now();
    h.commit([...plan], "тест");
    const elapsed = performance.now() - start;
    expect(h.present.length).toBe(300);
    expect(elapsed).toBeLessThan(1000);
  });
});
import { describe, expect, it } from "vitest";
import { formatKspDate, previewReport, sortKspCards, kspFileStem } from "./kspModel";
import type { KspCard } from "../../types";

describe("formatKspDate", () => {
  it("форматирует ISO в дд.мм.гггг", () => {
    expect(formatKspDate("2026-01-21")).toBe("21.01.2026");
  });
  it("отрезает время из штампа БД", () => {
    expect(formatKspDate("2026-01-21 00:00:00")).toBe("21.01.2026");
  });
  it("пусто — тире", () => {
    expect(formatKspDate(null)).toBe("—");
  });
});

describe("kspFileStem", () => {
  it("убирает запрещённые символы", () => {
    expect(kspFileStem({ className: "8А", topic: "Тема: a/b" })).toBe("КСП_8А_Тема_ a_b");
  });
});

describe("previewReport", () => {
  it("блокирует, если минуты не сходятся с эталоном", () => {
    const r = previewReport({
      topic: "Тема",
      valuesText: "труд",
      valueIds: [],
      homeworkText: "№ 1",
      homeworkCheck: "фронтально",
      lessonDuration: 45,
      objectivesCount: 1,
      stages: [
        { id: "a", type: "theory", title: "Теория", minutes: 20, teacherActions: "объясняет", assessment: { mode: "formative", descriptors: [{ text: "д", points: null }], maxPoints: null, feedbackMethod: "t" } },
        { id: "b", type: "practice", title: "Практика", minutes: 20, teacherActions: "даёт задания", assessment: { mode: "none", descriptors: [], maxPoints: null, feedbackMethod: "t" } },
      ],
    });
    expect(r.issues.some((i) => i.code === "V-03")).toBe(true);
    expect(r.canMarkReady).toBe(false);
  });

  it("предупреждения не дают статус «готов»", () => {
    const r = previewReport({
      topic: "Тема",
      valuesText: "",
      valueIds: [],
      homeworkText: "№ 1",
      homeworkCheck: "фронтально",
      lessonDuration: 45,
      objectivesCount: 1,
      stages: [
        { id: "a", type: "practice", title: "Практика", minutes: 45, teacherActions: "даёт задания", assessment: { mode: "formative", descriptors: [{ text: "д", points: null }], maxPoints: null, feedbackMethod: "t" } },
      ],
    });
    expect(r.issues.some((i) => i.code === "V-09" && i.level === "warning")).toBe(true);
    expect(r.canMarkReady).toBe(false);
  });

  it("пропускает полный каркас на 45 минут", () => {
    const r = previewReport({
      topic: "Тема",
      valuesText: "труд",
      valueIds: ["diligence"],
      homeworkText: "№ 1",
      homeworkCheck: "фронтально",
      lessonDuration: 45,
      objectivesCount: 1,
      stages: [
        { id: "g", type: "greeting", title: "Приветствие", minutes: 1, teacherActions: "приветствует", assessment: { mode: "none", descriptors: [{ text: "настроение", points: null }], maxPoints: null, feedbackMethod: "t" } },
        { id: "p", type: "practice", title: "Практика", minutes: 44, teacherActions: "даёт задания", assessment: { mode: "formative", descriptors: [], maxPoints: null, feedbackMethod: "t" } },
      ],
    });
    expect(r.canMarkReady).toBe(true);
  });

  it("не требует ДЗ на уроке СОЧ", () => {
    const r = previewReport({
      topic: "СОЧ",
      valuesText: "труд",
      valueIds: ["x"],
      homeworkText: "",
      homeworkCheck: "",
      lessonDuration: 45,
      objectivesCount: 1,
      stages: [
        { id: "s", type: "soch", title: "СОЧ", minutes: 45, teacherActions: "проводит", assessment: { mode: "summative", descriptors: [{ text: "д", points: 10 }], maxPoints: 10, feedbackMethod: "t" } },
      ],
    });
    expect(r.issues.some((i) => i.code === "V-13")).toBe(false);
  });
});

describe("sortKspCards", () => {
  const cards = [
    { id: "1", topic: "Бета", grade: 8, status: "ready", globalIndex: 2, plannedDate: "2026-01-10", subjectId: "alg", className: "8", updatedAt: "2", ktpLessonId: "", ktpPlanId: "", language: "ru", academicYear: "", section: "", lessonType: "" },
    { id: "2", topic: "Альфа", grade: 7, status: "draft", globalIndex: 1, plannedDate: "2026-01-20", subjectId: "geo", className: "7", updatedAt: "1", ktpLessonId: "", ktpPlanId: "", language: "ru", academicYear: "", section: "", lessonType: "" },
  ] as KspCard[];

  it("сортирует по теме", () => {
    expect(sortKspCards(cards, "topic", "asc").map((c) => c.topic)).toEqual(["Альфа", "Бета"]);
  });
  it("сортирует по номеру урока", () => {
    expect(sortKspCards(cards, "index", "asc").map((c) => c.globalIndex)).toEqual([1, 2]);
  });
});

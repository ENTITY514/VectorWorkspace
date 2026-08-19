// src/entities/ktp/model/invariants.test.ts
// Тесты инвариантов КТП (Фаза 4): FR-2.2 и FR-2.3.

import {
  checkFr22,
  checkFr23,
  splitPlanIntoQuarters,
  validateKtpPlanInvariants,
} from "./invariants";
import { IKtpLesson, KtpPlan, LessonRowType } from "./types";

let seq = 0;
const lesson = (rowType: LessonRowType, overrides: Partial<IKtpLesson> = {}): IKtpLesson => ({
  id: `l-${++seq}`,
  lessonNumber: 0,
  hoursInSection: 1,
  sectionName: "Раздел",
  lessonTopic: "Тема",
  objectives: [],
  hours: 1,
  date: "",
  notes: "",
  rowType,
  ...overrides,
});

const quarterHeader = (n: number): IKtpLesson => ({
  id: `qh-${n}`,
  lessonNumber: 0,
  hoursInSection: 0,
  sectionName: `Четверть ${n}`,
  lessonTopic: "",
  objectives: [],
  hours: 0,
  date: "",
  notes: "",
  rowType: LessonRowType.QUARTER_HEADER,
});

describe("checkFr22 (FR-2.2: Index(Soch) - Index(LastSor) = 2)", () => {
  test("ок: СОР → буфер → СОЧ (разница 2)", () => {
    const lessons = [
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOCH),
    ];
    const r = checkFr22(lessons);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("дистанция соблюдена");
  });

  test("нарушение: СОР сразу перед СОЧ (разница 1)", () => {
    const lessons = [
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.SOCH),
    ];
    const r = checkFr22(lessons);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("нужно ровно 1 промежуточный урок");
  });

  test("используется ПОСЛЕДНИЙ СОР перед СОЧ", () => {
    const lessons = [
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOCH),
    ];
    // Последний СОР — idx 2, СОЧ — idx 4 → разница 2 → ок.
    expect(checkFr22(lessons).ok).toBe(true);
  });

  test("СОЧ без СОР — инвариант не применим", () => {
    const lessons = [
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOCH),
    ];
    expect(checkFr22(lessons).ok).toBe(true);
  });

  test("нет СОЧ — инвариант не применим", () => {
    const lessons = [lesson(LessonRowType.SOR), lesson(LessonRowType.STANDARD)];
    expect(checkFr22(lessons).ok).toBe(true);
  });
});

describe("checkFr23 (FR-2.3: TotalLessons - Index(Soch) >= HoursPerWeek)", () => {
  test("ок: буфер после СОЧ ≥ недельной нагрузки", () => {
    const r = checkFr23(6, 4, 2);
    expect(r.ok).toBe(true);
  });

  test("нарушение: буфер меньше недельной нагрузки", () => {
    const r = checkFr23(5, 4, 2);
    expect(r.ok).toBe(false);
  });

  test("нет СОЧ — не применим", () => {
    expect(checkFr23(5, 0, 2).ok).toBe(true);
  });
});

describe("validateKtpPlanInvariants", () => {
  test("план без нарушений проходит все четверти", () => {
    const plan: KtpPlan = [
      quarterHeader(1),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOCH),
      lesson(LessonRowType.REPETITION),
      lesson(LessonRowType.REPETITION),
      quarterHeader(2),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOCH),
      lesson(LessonRowType.REPETITION),
      lesson(LessonRowType.REPETITION),
    ];
    const report = validateKtpPlanInvariants(plan, 2);
    expect(report.valid).toBe(true);
    expect(report.checks).toHaveLength(2);
  });

  test("нарушение FR-2.3 в одной четверти ломает весь план", () => {
    const plan: KtpPlan = [
      quarterHeader(1),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOCH), // после СОЧ только 1 урок, нагрузка 2
      lesson(LessonRowType.REPETITION),
    ];
    const report = validateKtpPlanInvariants(plan, 2);
    expect(report.valid).toBe(false);
    expect(report.checks[0].fr22.ok).toBe(true);
    expect(report.checks[0].fr23.ok).toBe(false);
  });

  test("нарушение FR-2.2 в одной четверти ломает весь план", () => {
    const plan: KtpPlan = [
      quarterHeader(1),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      lesson(LessonRowType.SOCH),
    ];
    const report = validateKtpPlanInvariants(plan, 2);
    expect(report.valid).toBe(false);
    expect(report.checks[0].fr22.ok).toBe(false);
  });

  test("пустой план — валиден (нет четвертей)", () => {
    expect(validateKtpPlanInvariants([], 2).valid).toBe(true);
  });
});

describe("splitPlanIntoQuarters", () => {
  test("группирует уроки по заголовкам четвертей", () => {
    const plan: KtpPlan = [
      quarterHeader(1),
      lesson(LessonRowType.STANDARD),
      lesson(LessonRowType.SOR),
      quarterHeader(2),
      lesson(LessonRowType.SOCH),
    ];
    const quarters = splitPlanIntoQuarters(plan);
    expect(quarters).toHaveLength(2);
    expect(quarters[0]).toHaveLength(2);
    expect(quarters[1]).toHaveLength(1);
  });
});
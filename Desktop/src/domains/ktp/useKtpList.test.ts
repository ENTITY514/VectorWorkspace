import { describe, expect, it } from "vitest";
import type { KtpPlanCard } from "../../types";
import {
  academicYearOptions,
  defaultAcademicYear,
  filterKtpPlans,
  startYearOf,
} from "./ktpListModel";

function card(partial: Partial<KtpPlanCard>): KtpPlanCard {
  return {
    id: partial.id ?? "1",
    subjectId: partial.subjectId ?? "algebra",
    grade: partial.grade ?? 8,
    language: partial.language ?? "RU",
    academicYear: partial.academicYear ?? "2026-2027",
    totalHours: partial.totalHours ?? 102,
    status: partial.status ?? "Draft",
    daysOfWeek: partial.daysOfWeek ?? "2,4",
  };
}

describe("defaultAcademicYear", () => {
  it("в сентябре берёт текущий год как начало", () => {
    expect(defaultAcademicYear(new Date(2026, 8, 6))).toBe("2026-2027");
  });

  it("в марте берёт предыдущий год как начало", () => {
    expect(defaultAcademicYear(new Date(2027, 2, 1))).toBe("2026-2027");
  });
});

describe("startYearOf / academicYearOptions", () => {
  it("читает год начала и даёт соседние", () => {
    expect(startYearOf("2026-2027")).toBe(2026);
    expect(academicYearOptions("2026-2027")).toEqual([
      "2025-2026",
      "2026-2027",
      "2027-2028",
    ]);
  });
});

describe("filterKtpPlans", () => {
  const plans = [
    card({ id: "a", subjectId: "algebra", grade: 8, status: "Draft" }),
    card({ id: "b", subjectId: "geometry", grade: 8, status: "Approved", language: "KK" }),
    card({ id: "c", subjectId: "algebra", grade: 9, status: "Draft", academicYear: "2025-2026" }),
  ];

  it("фильтрует по классу и статусу", () => {
    const out = filterKtpPlans(plans, { query: "", grade: 8, status: "Draft", year: "" });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("ищет по русскому названию предмета", () => {
    const out = filterKtpPlans(plans, { query: "алгебр", grade: null, status: "", year: "" });
    expect(out.map((p) => p.id).sort()).toEqual(["a", "c"]);
  });

  it("фильтрует по учебному году", () => {
    const out = filterKtpPlans(plans, { query: "", grade: null, status: "", year: "2025-2026" });
    expect(out.map((p) => p.id)).toEqual(["c"]);
  });
});

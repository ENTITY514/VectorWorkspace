import { describe, expect, it } from "vitest";
import { resolveImport, type BackupManifest } from "./backup";
import type { KtpPlan } from "../types";

function stubPlan(): KtpPlan {
  return {
    id: "old-plan",
    subjectId: "algebra",
    grade: 8,
    language: "RU",
    academicYear: "2026-2027",
    totalHours: 2,
    status: "Approved",
    createdAt: "",
    updatedAt: "",
    daysOfWeek: "1,3",
    quarters: [
      {
        id: "old-q",
        ktpId: "old-plan",
        quarterNumber: 1,
        hoursPerWeek: 3,
        lessons: [
          {
            id: "old-l",
            quarterId: "old-q",
            globalIndex: 1,
            quarterIndex: 1,
            topicTitle: "Тема",
            sectionName: "Раздел",
            lessonType: "Standard",
            plannedDate: "2026-09-01",
            isCancelled: false,
            notes: "д/з",
            objectives: [],
          },
        ],
      },
    ],
    invariant: { valid: true, checks: [] },
  };
}

describe("resolveImport", () => {
  it("перегенерирует id плана, четверти и урока и переписывает quarterId", () => {
    const manifest: BackupManifest = {
      schemaVersion: 1,
      exportedAt: "",
      sections: ["plans"],
      plans: [stubPlan()],
      templates: [],
      tupDocuments: [],
    };
    const { plans } = resolveImport(manifest);
    expect(plans).toHaveLength(1);
    expect(plans[0].id).not.toBe("old-plan");
    expect(plans[0].status).toBe("Draft");
    expect(plans[0].quarters[0].id).not.toBe("old-q");
    expect(plans[0].quarters[0].ktpId).toBe(plans[0].id);
    expect(plans[0].quarters[0].lessons[0].id).not.toBe("old-l");
    expect(plans[0].quarters[0].lessons[0].quarterId).toBe(plans[0].quarters[0].id);
    expect(plans[0].quarters[0].lessons[0].notes).toBe("д/з");
  });
});

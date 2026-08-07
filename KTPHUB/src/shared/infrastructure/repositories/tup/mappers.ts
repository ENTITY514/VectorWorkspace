import { AcademicPlan } from "../../../../entities/circulumPlan/model/types";
import { ProgramKind, TupMeta, TupStatus } from "../types";

export interface TupDocumentRow {
  id: string;
  title: string;
  subject: string;
  grade: string;
  language: string;
  program_kind: ProgramKind;
  academic_year: string;
  status: TupStatus;
  content_version: number;
  plan_json: AcademicPlan;
  source_file_path: string | null;
  updated_at: string;
}

export function mapTupMeta(row: TupDocumentRow): TupMeta {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    language: row.language,
    programKind: row.program_kind,
    academicYear: row.academic_year,
    status: row.status,
    contentVersion: row.content_version,
    updatedAt: row.updated_at,
  };
}

export function flattenPlanToBlocks(plan: AcademicPlan) {
  const quarters = plan.map((quarter, qi) => ({
    sort_order: qi,
    name: quarter.name,
    repetition_info: quarter.repetitionInfo ?? [],
    sections: quarter.sections.map((section, si) => ({
      sort_order: si,
      name: section.name,
      topics: section.topics.map((topic, ti) => ({
        sort_order: ti,
        name: topic.name,
        objectives: topic.objectives.map((obj, oi) => ({
          sort_order: oi,
          objective_code: obj.id,
          description: obj.description,
        })),
      })),
    })),
  }));

  return quarters;
}

// Преобразование нормативного базиса (ТУП из БД) в план КТП.
// Использует существующую модель KtpPlan (см. ktp/model/types.ts) — ту же,
// что принимают word-generator и xlsx-generator.

import { v4 as uuidv4 } from "uuid";
import { KtpPlan, LessonRowType, ILessonObjective } from "./model/types";
import type { TupDocumentDetail } from "../types";

const formatCode = (code: string): string => code.replace(/\s+/g, "");

/**
 * Строит КТП для одного класса из полного документа ТУП.
 * ДСП (Параграф 3): четверти -> разделы -> темы. Для каждой темы берутся
 * коды целей, их описания подставляются из матрицы целей (П2) по коду.
 * A10: после каждого СОР — дубликат последнего обычного урока раздела,
 * между СОР и СОЧ нет «повторения». A9: СОЧ с полным наименованием.
 * A8: хвостовые повторения по названиям разделов (max(2, sections.length)).
 */
export function buildKtpFromTup(detail: TupDocumentDetail, grade: number): KtpPlan {
  const ktp: KtpPlan = [];

  const objectivesByCode = new Map<string, string>();
  for (const o of detail.objectives) {
    if (!objectivesByCode.has(formatCode(o.code))) {
      objectivesByCode.set(formatCode(o.code), o.description);
    }
  }

  const gradeQuarters = detail.quarters
    .filter((q) => q.grade === grade)
    .sort((a, b) => a.quarterNumber - b.quarterNumber);

  let lessonNumber = 1;

  for (const quarter of gradeQuarters) {
    ktp.push({
      id: uuidv4(),
      lessonNumber: 0,
      hoursInSection: 0,
      sectionName: `${quarter.quarterNumber}-я четверть`,
      lessonTopic: "",
      objectives: [],
      hours: 0,
      date: "",
      notes: "",
      rowType: LessonRowType.QUARTER_HEADER,
    });

    for (const section of quarter.sections) {
      let lastStandard: (typeof ktp)[number] | null = null;
      for (const topic of section.topics) {
        const objectives: ILessonObjective[] = topic.objectiveCodes
          .map((code) => ({
            id: code,
            description: objectivesByCode.get(formatCode(code)) ?? "",
          }))
          .filter((o) => o.description !== "");

        const lesson = {
          id: uuidv4(),
          lessonNumber: lessonNumber++,
          hoursInSection: 1,
          sectionName: section.name,
          lessonTopic: topic.name,
          objectives,
          hours: 1,
          date: "",
          notes: "",
          rowType: LessonRowType.STANDARD,
        };
        lastStandard = lesson;
        ktp.push(lesson);
      }

      // A4: СОР дублирует тему/цель последнего обычного урока раздела.
      ktp.push({
        id: uuidv4(),
        lessonNumber: lessonNumber++,
        hoursInSection: 1,
        sectionName: "Суммативное оценивание за раздел",
        lessonTopic: lastStandard?.lessonTopic ?? "",
        objectives: lastStandard?.objectives ?? [],
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.SOR,
      });

      // A10: сразу после СОР — дубликат последнего обычного урока раздела.
      if (lastStandard) {
        ktp.push({ ...lastStandard, id: uuidv4(), lessonNumber: lessonNumber++, date: "", notes: "" });
      }
    }

    // A9: полное наименование контрольной работы.
    ktp.push({
      id: uuidv4(),
      lessonNumber: lessonNumber++,
      hoursInSection: 1,
      sectionName: "Суммативное оценивание за четверть",
      lessonTopic: `Суммативное оценивание за ${quarter.quarterNumber} четверть`,
      objectives: [],
      hours: 1,
      date: "",
      notes: "",
      rowType: LessonRowType.SOCH,
    });

    // A8: хвостовые повторения — по названиям разделов (при одном — дубль).
    const sectionNames = quarter.sections.map((s) => s.name);
    const repetitionCount = Math.max(2, sectionNames.length);
    for (let i = 0; i < repetitionCount; i++) {
      ktp.push({
        id: uuidv4(),
        lessonNumber: lessonNumber++,
        hoursInSection: 1,
        sectionName: "Повторение",
        lessonTopic: sectionNames.length ? sectionNames[i % sectionNames.length] : `Повторение #${i + 1}`,
        objectives: [],
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.REPETITION,
      });
    }
  }

  return ktp;
}

/** Часы в неделю для класса из учебной нагрузки документа. */
export function hoursPerWeekForGrade(detail: TupDocumentDetail, grade: number): number {
  const h = detail.hours.find((x) => x.grade === grade);
  return h ? h.hoursPerWeek : 0;
}

/** Сумма часов плана. */
export function totalHoursOf(plan: KtpPlan): number {
  return plan.reduce((s, r) => s + (r.hours || 0), 0);
}

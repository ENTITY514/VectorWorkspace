// Портировано из KTPHUB: src/entities/ktp/model/lib.ts
// Преобразование ТУП -> КТП и перенумерация плана.

import { v4 as uuidv4 } from "uuid";
import { AcademicPlan } from "../tup/model/types";
import { KtpPlan, LessonRowType } from "./model/types";

export const transformTupToKtp = (tup: AcademicPlan): KtpPlan => {
  let lessonNumber = 1;
  const ktp: KtpPlan = [];

  tup.forEach((quarter) => {
    ktp.push({
      id: uuidv4(),
      lessonNumber: 0,
      hoursInSection: 0,
      sectionName: quarter.name,
      lessonTopic: "",
      objectives: [],
      hours: 0,
      date: "",
      notes: "",
      rowType: LessonRowType.QUARTER_HEADER,
    });

    quarter.repetitionInfo.forEach((repetitionTopic) => {
      ktp.push({
        id: uuidv4(),
        lessonNumber: lessonNumber++,
        hoursInSection: 1,
        sectionName: "Повторение",
        lessonTopic: repetitionTopic,
        objectives: [],
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.REPETITION,
      });
    });

    quarter.sections.forEach((section) => {
      section.topics.forEach((topic) => {
        topic.objectives.forEach((objective) => {
          ktp.push({
            id: uuidv4(),
            lessonNumber: lessonNumber++,
            hoursInSection: 1,
            sectionName: section.name,
            lessonTopic: topic.name,
            objectives: [
              {
                id: objective.id,
                description: objective.description,
              },
            ],
            hours: 1,
            date: "",
            notes: "",
            rowType: LessonRowType.STANDARD,
          });
        });
      });
    });

    ktp.push({
      id: uuidv4(),
      lessonNumber: lessonNumber++,
      hoursInSection: 1,
      sectionName: "Суммативное оценивание за четверть",
      lessonTopic: "СОЧ",
      objectives: [],
      hours: 1,
      date: "",
      notes: "",
      rowType: LessonRowType.SOCH,
    });

    for (let i = 0; i < 2; i++) {
      ktp.push({
        id: uuidv4(),
        lessonNumber: lessonNumber++,
        hoursInSection: 1,
        sectionName: "Повторение",
        lessonTopic: `Повторение #${i + 1}`,
        objectives: [],
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.REPETITION,
      });
    }
  });

  return ktp;
};

export const renumberPlan = (plan: KtpPlan): KtpPlan => {
  let lessonNumber = 1;
  return plan.map((lesson) => {
    if (
      lesson.rowType === LessonRowType.STANDARD ||
      lesson.rowType === LessonRowType.REPETITION ||
      lesson.rowType === LessonRowType.SOCH ||
      lesson.rowType === LessonRowType.SOR
    ) {
      return {
        ...lesson,
        lessonNumber: lessonNumber++,
      };
    }
    return lesson;
  });
};
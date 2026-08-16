// Адаптер: преобразует нашу упрощённую модель урока (Lesson)
// в формат плана КТП KTPHUB (IKtpLesson[]), который используют
// word-generator.ts и xlsx-generator.ts.

import { Lesson } from "../types";
import { LessonRowType, KtpPlan } from "./model/types";

function quarterForWeek(week: number): string {
  // 1-я четверть: недели 1–9, 2-я: 10–18, 3-я: 19–27, 4-я: 28–36
  if (week <= 9) return "1-четверть";
  if (week <= 18) return "2-четверть";
  if (week <= 27) return "3-четверть";
  return "4-четверть";
}

export function buildPlanFromLessons(lessons: Lesson[]): KtpPlan {
  const sorted = [...lessons].sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  const plan: KtpPlan = [];
  let lessonNumber = 0;

  const quarterGroups = new Map<string, Lesson[]>();
  sorted.forEach((l) => {
    const q = quarterForWeek(l.week);
    if (!quarterGroups.has(q)) quarterGroups.set(q, []);
    quarterGroups.get(q)!.push(l);
  });

  for (const [quarterName, group] of quarterGroups) {
    const quarterHours = group.reduce((s, l) => s + l.hours, 0);
    plan.push({
      id: `q-${quarterName}`,
      lessonNumber: 0,
      hoursInSection: quarterHours,
      sectionName: quarterName,
      lessonTopic: "",
      objectives: [],
      hours: quarterHours,
      date: "",
      notes: "",
      rowType: LessonRowType.QUARTER_HEADER,
    });

    const sectionGroups = new Map<string, Lesson[]>();
    group.forEach((l) => {
      if (!sectionGroups.has(l.section)) sectionGroups.set(l.section, []);
      sectionGroups.get(l.section)!.push(l);
    });

    for (const [sectionName, sectionLessons] of sectionGroups) {
      let hoursInSection = 0;
      for (const l of sectionLessons) {
        lessonNumber++;
        hoursInSection += l.hours;
        plan.push({
          id: l.id,
          lessonNumber,
          hoursInSection,
          sectionName,
          lessonTopic: l.topic,
          objectives: [{ id: l.learningGoal, description: `ЦО ${l.learningGoal}` }],
          hours: l.hours,
          date: l.date || "",
          notes: l.textbookRef || "",
          rowType: LessonRowType.STANDARD,
        });
      }
    }
  }

  return plan;
}

export function buildPlanForGrade(lessons: Lesson[], grade: string): KtpPlan {
  return buildPlanFromLessons(lessons.filter((l) => l.grade === grade));
}

export function buildPlanFromAll(lessons: Lesson[]): KtpPlan {
  return buildPlanFromLessons(lessons);
}
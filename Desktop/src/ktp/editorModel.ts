// Преобразование КТП между плоской моделью редактора (KTPHUB-стиль) и
// вложенной моделью БД (quarters → lessons). Экспортные генераторы работают
// с плоской моделью, редактор тоже; БД — вложенная.

import { v4 as uuidv4 } from "uuid";
import { IKtpLesson, KtpPlan, LessonRowType } from "./model/types";
import type { KtpLesson as DbLesson, KtpPlan as DbPlan } from "../types";

/** Плоская модель из вложенной (загрузка плана в редактор). */
export function flattenPlan(db: DbPlan): KtpPlan {
  const flat: KtpPlan = [];

  for (const q of db.quarters) {
    flat.push({
      id: q.id,
      lessonNumber: 0,
      hoursInSection: 0,
      sectionName: `${q.quarterNumber}-я четверть · ${q.hoursPerWeek} ч/нед`,
      lessonTopic: "",
      objectives: [],
      hours: 0,
      date: "",
      notes: "",
      rowType: LessonRowType.QUARTER_HEADER,
    });

    for (const l of q.lessons) {
      flat.push({
        id: l.id,
        lessonNumber: l.quarterIndex,
        hoursInSection: 1,
        sectionName: quarterSectionLabel(l),
        lessonTopic: l.topicTitle,
        objectives: l.objectiveCodes.map((code) => ({ id: code, description: code })),
        hours: 1,
        date: l.plannedDate ?? "",
        notes: "",
        rowType: toFlatType(l.lessonType),
      });
    }
  }

  return renumberPlan(flat);
}

function quarterSectionLabel(l: DbLesson): string {
  switch (l.lessonType) {
    case "Sor":
      return "Суммативное оценивание за раздел";
    case "Soch":
      return "Суммативное оценивание за четверть";
    case "Revision":
      return "Повторение";
    default:
      return "Темы долгосрочного планирования";
  }
}

function toFlatType(kind: string): LessonRowType {
  switch (kind) {
    case "Sor":
      return LessonRowType.SOR;
    case "Soch":
      return LessonRowType.SOCH;
    case "Revision":
      return LessonRowType.REPETITION;
    default:
      return LessonRowType.STANDARD;
  }
}

/** Вложенная модель из плоской (сохранение из редактора в БД). */
export function unflattenPlan(db: DbPlan, flat: KtpPlan): DbPlan {
  const quarters = db.quarters.map((q) => ({ ...q, lessons: [] as DbLesson[] }));

  let currentQuarterId = "";
  let quarterIndexByLesson = new Map<string, number>();
  let global = 0;
  const counter: Record<string, number> = {};

  for (const row of flat) {
    if (row.rowType === LessonRowType.QUARTER_HEADER) {
      currentQuarterId = row.id;
      counter[currentQuarterId] = 0;
      continue;
    }
    const q = quarters.find((x) => x.id === currentQuarterId);
    if (!q) continue;
    counter[currentQuarterId] = (counter[currentQuarterId] ?? 0) + 1;
    const qIdx = counter[currentQuarterId];
    global += 1;
    quarterIndexByLesson.set(row.id, qIdx);
    q.lessons.push({
      id: row.id,
      quarterId: currentQuarterId,
      globalIndex: global,
      quarterIndex: qIdx,
      topicTitle: row.lessonTopic,
      lessonType: toDbType(row.rowType),
      plannedDate: row.date || null,
      isCancelled: false,
      objectiveCodes: row.objectives.map((o) => o.id),
    });
  }

  return { ...db, quarters, totalHours: global };
}

function toDbType(rt: LessonRowType): import("../types").LessonKind {
  switch (rt) {
    case LessonRowType.SOR:
      return "Sor";
    case LessonRowType.SOCH:
      return "Soch";
    case LessonRowType.REPETITION:
      return "Revision";
    default:
      return "Standard";
  }
}

/** Перенумеровка уроков (кроме шапок четвертей). */
export function renumberPlan(plan: KtpPlan): KtpPlan {
  let n = 1;
  return plan.map((l) => {
    if (l.rowType === LessonRowType.QUARTER_HEADER) return l;
    return { ...l, lessonNumber: n++ };
  });
}

/** Добавить час (копия урока) — как в KTPHUB slice.addHour. */
export function addHourToPlan(plan: KtpPlan, lessonId: string): KtpPlan {
  const idx = plan.findIndex((l) => l.id === lessonId);
  if (idx === -1) return plan;
  const src = plan[idx];
  const copy: IKtpLesson = { ...src, id: uuidv4(), date: "", notes: "", lessonNumber: src.lessonNumber + 1 };
  const next = [...plan];
  next.splice(idx + 1, 0, copy);
  return renumberPlan(next);
}

/** Удалить урок (защита последнего урока раздела — как KTPHUB). */
export function deleteLessonFromPlan(plan: KtpPlan, lessonId: string): { plan: KtpPlan; error?: string } {
  const lesson = plan.find((l) => l.id === lessonId);
  if (!lesson || lesson.rowType === LessonRowType.QUARTER_HEADER) return { plan };

  const sectionName = lesson.sectionName;
  const lessonsInSection = plan.filter(
    (l) =>
      l.sectionName === sectionName &&
      (l.rowType === LessonRowType.STANDARD ||
        l.rowType === LessonRowType.SOCH ||
        l.rowType === LessonRowType.SOR),
  );
  if (lessonsInSection.length <= 1) {
    return { plan, error: "Нельзя удалить последний урок в разделе." };
  }

  const otherObjectiveIds = new Set(
    plan
      .filter((l) => l.id !== lessonId && l.sectionName === sectionName)
      .flatMap((l) => l.objectives.map((o) => o.id)),
  );
  if (lesson.rowType === LessonRowType.STANDARD && lesson.objectives.some((o) => !otherObjectiveIds.has(o.id))) {
    return {
      plan,
      error: "Нельзя удалить урок: он содержит цель, которой нет в других уроках раздела.",
    };
  }

  return { plan: renumberPlan(plan.filter((l) => l.id !== lessonId)) };
}

/** Разделить цели по отдельным урокам — как KTPHUB.slice.splitAllObjectives. */
export function splitObjectivesInPlan(plan: KtpPlan, lessonId: string): KtpPlan {
  const idx = plan.findIndex((l) => l.id === lessonId);
  if (idx === -1) return plan;
  const src = plan[idx];
  if (src.objectives.length < 2) return plan;

  const head = { ...src, objectives: [src.objectives[0]] };
  const rest = src.objectives.slice(1).map((o) => ({
    ...src,
    id: uuidv4(),
    objectives: [o],
    date: "",
    notes: "",
  }));
  const next = [...plan];
  next.splice(idx, 1, head, ...rest);
  return renumberPlan(next);
}

/** Добавить СОР после раздела — как KTPHUB.slice.addSor. */
export function addSorToPlan(plan: KtpPlan, lessonId: string): KtpPlan {
  const idx = plan.findIndex((l) => l.id === lessonId);
  if (idx === -1) return plan;
  const sectionLast = plan[idx];
  const totalSorCount = plan.filter((l) => l.rowType === LessonRowType.SOR).length;

  const sor: IKtpLesson = {
    ...sectionLast,
    id: uuidv4(),
    lessonTopic: `СОР №${totalSorCount + 1} по разделу "${sectionLast.sectionName}"`,
    objectives: sectionLast.objectives,
    hours: 1,
    date: "",
    notes: "",
    rowType: LessonRowType.SOR,
  };
  const hour: IKtpLesson = { ...sectionLast, id: uuidv4(), date: "", notes: "" };
  const next = [...plan];
  next.splice(idx + 1, 0, sor, hour);
  return renumberPlan(next);
}

/** Объединить урок со следующим (общая дата + примечание) — как KTPHUB. */
export function mergeLessonWithNext(
  plan: KtpPlan,
  lessonId: string,
  reason: string,
): KtpPlan {
  const idx = plan.findIndex((l) => l.id === lessonId);
  if (idx === -1 || idx + 1 >= plan.length) return plan;
  const cur = plan[idx];
  const next = plan[idx + 1];
  const updated = [...plan];
  updated[idx] = { ...cur, notes: reason };
  updated[idx + 1] = { ...next, date: cur.date, notes: reason };
  return updated;
}

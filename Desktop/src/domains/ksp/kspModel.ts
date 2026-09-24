import type {
  KspCard,
  KspIssueLevel,
  KspStage,
  KspStageType,
  KspStatus,
  KspValidationIssue,
  KspValidationReport,
} from "../../types";

export const STAGE_LABEL: Record<KspStageType, string> = {
  greeting: "Приветствие, орг. момент",
  warmup: "Целеполагание",
  actualization: "Актуализация знаний",
  theory: "Теоретический материал",
  practice: "Практический материал",
  formative_assessment: "Формативное оценивание",
  sor: "СОР",
  soch: "СОЧ",
  homework: "Домашнее задание",
  reflection: "Рефлексия / завершение",
  physical_minute: "Физкультминутка",
};

export const STAGE_TYPES: KspStageType[] = [
  "greeting",
  "warmup",
  "actualization",
  "theory",
  "practice",
  "formative_assessment",
  "sor",
  "soch",
  "homework",
  "reflection",
  "physical_minute",
];

export const STATUS_LABEL: Record<KspStatus, string> = {
  draft: "Черновик",
  ready: "Готов к уроку",
  approved: "Утверждён",
  conducted: "Проведён",
  archived: "Архив",
};

export const STATUS_ORDER: KspStatus[] = ["draft", "ready", "approved", "conducted", "archived"];

export type KspSortKey = "date" | "topic" | "subject" | "grade" | "status" | "index" | "updated";
export type SortDir = "asc" | "desc";

export function statusTone(status: KspStatus): string {
  switch (status) {
    case "ready":
    case "approved":
      return "green";
    case "conducted":
      return "blue";
    case "archived":
      return "gray";
    default:
      return "amber";
  }
}

export function issueTone(level: KspIssueLevel): string {
  if (level === "blocking") return "red";
  if (level === "warning") return "amber";
  return "blue";
}

export function formatKspDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = iso.trim().split(/[T\s]/)[0];
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return iso;
  return `${d.slice(0, 2)}.${m}.${y}`;
}

export function kspFileStem(input: { className?: string; topic?: string }): string {
  const cls = (input.className || "класс").replace(/[\\/:*?"<>|]/g, "_");
  const topic = (input.topic || "ксп").slice(0, 40).replace(/[\\/:*?"<>|]/g, "_").trim() || "ксп";
  return `КСП_${cls}_${topic}`;
}

export function stageAssessText(s: KspStage): string {
  const mode = s.assessment.mode === "summative" ? "Суммативное" : s.assessment.mode === "formative" ? "Формативное" : "";
  const desc = s.assessment.descriptors.map((d) => {
    const pts = d.points != null ? ` (${d.points} б.)` : "";
    return `• ${d.text}${pts}`;
  }).join("\n");
  return [mode, desc].filter(Boolean).join("\n");
}

export type PreviewStage = {
  id: string;
  type?: KspStageType;
  title: string;
  minutes: number;
  teacherActions: string;
  studentActions?: string;
  assessment?: KspStage["assessment"];
};

export function previewReport(input: {
  topic: string;
  valuesText: string;
  valueIds: string[];
  homeworkText: string;
  homeworkCheck: string;
  lessonDuration: number;
  objectivesCount?: number;
  cancelled?: boolean;
  stages: PreviewStage[];
}): KspValidationReport {
  const issues: KspValidationIssue[] = [];
  const totalMinutes = input.stages.reduce((s, x) => s + x.minutes, 0);
  if (input.cancelled) {
    issues.push({ code: "V-01", level: "blocking", message: "Урок КТП отменён — КСП создавать нельзя.", stageId: null });
  }
  if (!input.topic.trim()) {
    issues.push({ code: "V-02", level: "blocking", message: "Тема урока пуста. Возьмите её из КТП.", stageId: null });
  }
  if (totalMinutes !== input.lessonDuration) {
    issues.push({
      code: "V-03",
      level: "blocking",
      message: `Сумма этапов ${totalMinutes} мин, эталон ${input.lessonDuration} мин. По приказу № 130 и ADR хронометраж обязан сойтись точно.`,
      stageId: null,
    });
  }
  for (const s of input.stages) {
    if (!s.teacherActions.trim()) {
      issues.push({ code: "V-04", level: "blocking", message: `${s.title}: нет действий педагога.`, stageId: s.id });
    }
    const a = s.assessment;
    if (a?.mode === "summative") {
      const sum = a.descriptors.reduce((n, d) => n + (d.points ?? 0), 0);
      if (a.maxPoints == null) {
        issues.push({ code: "V-05", level: "warning", message: `${s.title}: суммативное оценивание без max_points.`, stageId: s.id });
      } else if (sum !== a.maxPoints) {
        issues.push({ code: "V-05", level: "blocking", message: `${s.title}: сумма баллов дескрипторов ${sum} ≠ ${a.maxPoints}.`, stageId: s.id });
      }
    }
    if (a?.mode === "formative" && a.descriptors.some((d) => d.points != null)) {
      issues.push({ code: "V-11", level: "warning", message: `${s.title}: у формативных дескрипторов не должно быть баллов.`, stageId: s.id });
    }
  }
  if (!input.valuesText.trim() && input.valueIds.length === 0) {
    issues.push({ code: "V-09", level: "warning", message: "Не заполнен воспитательный компонент (FR-3.2).", stageId: null });
  }
  if ((input.objectivesCount ?? 0) === 0) {
    issues.push({ code: "V-02", level: "warning", message: "Нет целей обучения из КТП.", stageId: null });
  }
  const covered = input.stages.some((s) => (s.assessment?.descriptors.length ?? 0) > 0);
  if ((input.objectivesCount ?? 0) > 0 && !covered) {
    issues.push({ code: "V-10", level: "warning", message: "Ни одна цель не покрыта дескриптором.", stageId: null });
  }
  const soch = input.stages.filter((s) => s.type === "soch").reduce((n, s) => n + s.minutes, 0);
  const sochDominant = input.lessonDuration > 0 && soch * 2 >= input.lessonDuration;
  const hwStage = input.stages.some((s) =>
    s.type === "homework" && (s.teacherActions.trim() || (s.studentActions ?? "").trim()),
  );
  const hwText = input.homeworkText.trim();
  if (!sochDominant) {
    if (!hwText && !hwStage) {
      issues.push({ code: "V-13", level: "warning", message: "Не указано домашнее задание.", stageId: null });
    } else if (hwText && !input.homeworkCheck.trim()) {
      issues.push({ code: "V-13", level: "warning", message: "У ДЗ нет способа проверки.", stageId: null });
    }
  }
  if (input.stages[0] && input.stages[0].type && input.stages[0].type !== "greeting") {
    issues.push({ code: "V-14", level: "hint", message: "Первым этапом обычно идёт приветствие.", stageId: input.stages[0].id });
  }
  const practice = input.stages
    .filter((s) => s.type === "practice" || s.type === "formative_assessment")
    .reduce((n, s) => n + s.minutes, 0);
  if (input.lessonDuration > 0 && practice * 100 / input.lessonDuration < 30) {
    issues.push({ code: "V-15", level: "hint", message: "Доля практики меньше 30 % времени урока.", stageId: null });
  }

  return {
    issues,
    totalMinutes,
    lessonDuration: input.lessonDuration,
    canMarkReady: issues.every((i) => i.level === "hint"),
  };
}

export function sortKspCards(cards: KspCard[], key: KspSortKey, dir: SortDir): KspCard[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    const cmp = (() => {
      switch (key) {
        case "date":
          return (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "");
        case "topic":
          return a.topic.localeCompare(b.topic, "ru");
        case "subject":
          return a.subjectId.localeCompare(b.subjectId);
        case "grade":
          return a.grade - b.grade || a.className.localeCompare(b.className, "ru");
        case "status":
          return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        case "index":
          return a.globalIndex - b.globalIndex;
        case "updated":
          return a.updatedAt.localeCompare(b.updatedAt);
        default:
          return 0;
      }
    })();
    return cmp * sign;
  });
}

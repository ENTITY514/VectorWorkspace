// Портировано из KTPHUB: src/entities/ktp/model/types.tsx
// Модель КТП: плоский список уроков с типами строк.

export interface ILessonObjective {
  id: string;
  description: string;
}

export interface IKtpLesson {
  id: string;
  lessonNumber: number;
  hoursInSection: number;
  sectionName: string;
  lessonTopic: string;
  objectives: ILessonObjective[];
  hours: number;
  date: string;
  notes: string;
  rowType: LessonRowType;
}

export enum LessonRowType {
  STANDARD = "standard",
  QUARTER_HEADER = "quarter-header",
  SOCH = "soch",
  REPETITION = "repetition",
  SOR = "sor",
}

export type KtpPlan = IKtpLesson[];

export type DayOfWeek =
  | "понедельник"
  | "вторник"
  | "среда"
  | "четверг"
  | "пятница"
  | "суббота"
  | "воскресенье";

// Сохранённый КТП (из SavedKtp в slice.ts)
export interface SavedKtp {
  id: string;
  name: string;
  className: string;
  plan: KtpPlan;
  totalHours: number;
  quarterWorkHours: { q1: number; q2: number; q3: number; q4: number };
}

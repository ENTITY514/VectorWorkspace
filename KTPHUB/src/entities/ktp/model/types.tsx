// src/entities/ktp/model/types.ts

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

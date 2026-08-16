export type View =
  | "today"
  | "tup"
  | "ktp"
  | "lessons"
  | "library"
  | "sor"
  | "analytics"
  | "students";

export interface HealthReport {
  status: string;
  appVersion: string;
  schemaVersion: number;
}

export interface TupDocument {
  id: string;
  orderNumber: string;
  orderDate: string;
  appendixNumber: number;
  subjectId: string;
  language: string;
  targetGrades: string;
  direction: "common" | "emn" | "ogn";
  objectiveCount: number;
}

export interface LearningObjective {
  id: string;
  documentId: string;
  grade: number;
  sectionNumber: number;
  subsectionNumber: number;
  objectiveNumber: number;
  description: string;
  code: string;
}

export interface TupImportResult {
  documentId: string;
  subjectId: string;
  targetGrades: string;
  direction: "common" | "emn" | "ogn";
  objectivesImported: number;
}

export interface Lesson {
  id: string;
  grade: string;
  section: string;
  subsection: string;
  topic: string;
  learningGoal: string;
  hours: number;
  week: number;
  date?: string;
  status: "planned" | "ready" | "needs_review";
  textbookRef?: string;
}

export interface Task {
  id: string;
  textbook: string;
  section: string;
  chapter: string;
  number: string;
  goal: string;
  topic: string;
  difficulty: "base" | "middle" | "high";
  skills: string;
}

export interface KspStages {
  stage: string;
  time: string;
  teacher: string;
  student: string;
  assessment: string;
  resources: string;
}

export interface Ksp {
  id: string;
  lessonId: string;
  teacherName: string;
  className: string;
  date: string;
  topic: string;
  learningGoal: string;
  lessonGoals: string[];
  valueAspects: string;
  linkPrev: string;
  linkNext: string;
  linkedSor: string;
  stages: KspStages[];
}

export interface SorResultItem {
  goal: string;
  max: number;
  classAvg: number;
  weakCount: number;
  note: string;
}

export interface StudentWeakness {
  name: string;
  goals: string[];
  level: "base" | "middle" | "high";
}

export interface SorAnalysis {
  section: string;
  date: string;
  classAvg: number;
  classWeakGoals: string[];
  weakStudents: StudentWeakness[];
  targets: string[];
}

export interface CalendarEvent {
  date: string;
  type: "lesson" | "sor" | "soch" | "holiday" | "worksheet";
  title: string;
  grade?: string;
}

export type View =
  | "today"
  | "tup"
  | "ktp"
  | "lessons"
  | "library"
  | "sor"
  | "analytics"
  | "students"
  | "settings";

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

export interface TupDocumentListItem {
  id: string;
  subjectId: string;
  subjectName: string;
  targetGrades: string;
  directionStr: string;
  appendixNumber: number;
  orderNumber: string;
  orderDate: string;
  objectiveCount: number;
  hasDsp: boolean;
  language: string;
}

export interface TupDocumentDetail {
  id: string;
  orderNumber: string;
  orderDate: string;
  appendixNumber: number;
  subjectId: string;
  language: string;
  targetGrades: string;
  direction: "common" | "emn" | "ogn";
  legalBasis: string;
  goalText: string;
  tasks: string[];
  hours: TupHourDto[];
  objectives: LearningObjective[];
  quarters: TupQuarterDto[];
}

export interface TupHourDto {
  grade: number;
  hoursPerWeek: number;
  hoursPerYear: number;
}

export interface TupTopicDto {
  name: string;
  objectiveCodes: string[];
}

export interface TupSectionDto {
  name: string;
  topics: TupTopicDto[];
}

export interface TupQuarterDto {
  grade: number;
  quarterNumber: number;
  sections: TupSectionDto[];
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

export interface TupSearchHit {
  text: string;
  entityType: "objective" | "section" | "topic" | "task";
  entityId: string;
  documentId: string;
  subjectId: string;
  targetGrades: string;
  language: string;
  grade: number | null;
  quarterNumber: number | null;
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

// ---- КТП (Фаза 4): производственный календарь РК и редактор плана ----

export interface CalendarPeriod {
  name: string;
  start: string;
  end: string;
}

export interface RkCalendar {
  startYear: number;
  quarters: CalendarPeriod[];
  vacations: CalendarPeriod[];
  holidays: string[];
}

export type LessonKind = "Standard" | "Sor" | "Soch" | "Revision";

export interface LessonObjective {
  code: string;
  description: string;
}

export interface KtpLesson {
  id: string;
  quarterId: string;
  globalIndex: number;
  quarterIndex: number;
  topicTitle: string;
  sectionName: string;
  lessonType: LessonKind;
  plannedDate: string | null;
  isCancelled: boolean;
  objectives: LessonObjective[];
}

export interface KtpQuarter {
  id: string;
  ktpId: string;
  quarterNumber: number;
  hoursPerWeek: number;
  lessons: KtpLesson[];
}

export interface QuarterCheck {
  quarterNumber: number;
  fr22Ok: boolean;
  fr22Message: string;
  fr23Ok: boolean;
  fr23Message: string;
}

export interface InvariantReport {
  valid: boolean;
  checks: QuarterCheck[];
}

export interface KtpPlan {
  id: string;
  subjectId: string;
  grade: number;
  language: string;
  academicYear: string;
  totalHours: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  daysOfWeek: string;
  quarters: KtpQuarter[];
  invariant: InvariantReport;
}

export interface KtpPlanCard {
  id: string;
  subjectId: string;
  grade: number;
  language: string;
  academicYear: string;
  totalHours: number;
  status: string;
  daysOfWeek: string;
}

// ---- Идентичность (Фаза 2): школа, штат, профиль, классы ----

export type StaffRole = "Director" | "DeputyDirector" | "MethodHead" | "Teacher";

export interface School {
  id: string;
  name: string;
  region: string | null;
  createdAt: string;
}

export interface SchoolStaff {
  id: string;
  schoolId: string;
  role: StaffRole;
  roleLabel: string;
  fullName: string;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
}

export interface TeacherProfile {
  id: string;
  schoolId: string;
  fullName: string;
  category: string | null;
}

export interface ClassGroup {
  id: string;
  schoolId: string;
  grade: number;
  letter: string;
  language: "RU" | "KK";
}

export interface SchoolState {
  onboarded: boolean;
  school: School | null;
  staff: SchoolStaff[];
  profile: TeacherProfile | null;
  classes: ClassGroup[];
}

export interface OnboardSchoolInput {
  schoolName: string;
  region?: string | null;
  teacherFullName: string;
  teacherCategory?: string | null;
  directorFullName: string;
}

export interface SaveStaffInput {
  id?: string;
  schoolId: string;
  role: StaffRole;
  fullName: string;
  validFrom?: string | null;
}

export interface SaveClassInput {
  id?: string;
  schoolId: string;
  grade: number;
  letter: string;
  language: "RU" | "KK";
}

export type View =
  | "today"
  | "tup"
  | "ktp"
  | "lessons"
  | "library"
  | "sor"
  | "analytics"
  | "students"
  | "settings"
  | "schedule"
  | "ds";

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

// ---- Расписание (schedule) — изолированный домен ----
export type RoomType = "General" | "ChemistryLab" | "PhysicsLab" | "BiologyLab" | "Informatics" | "LanguageLab" | "Gym" | "Workshop";
export type Shift = "First" | "Second";

export interface ScheduleTeacher {
  id: string;
  full_name: string;
  base_room_id: string | null;
  max_daily_lessons: number;
  availability_json: string;
}

export interface ScheduleRoom {
  id: string;
  name: string;
  room_type: RoomType;
  capacity: number;
  base_teacher_id: string | null;
  floor: number | null;
}

export interface ScheduleClass {
  id: string;
  grade: number;
  letter: string;
  headcount: number;
  shift: Shift;
}

export interface ScheduleSubject {
  id: string;
  name: string;
  sanitary_weight: number;
  required_room_type: RoomType | null;
  requires_split: boolean;
  is_double_allowed: boolean;
  related_subjects_json: string;
}

export interface ScheduleSubgroupRule {
  id: string;
  class_id: string;
  subject_id: string;
  group_count: number;
}

export interface ScheduleCurriculum {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  split_teacher2_id: string | null;
  hours_per_week: number;
}

export interface ScheduleWeights {
  id: string;
  window: number;
  room_displacement: number;
  sanpin_parabola: number;
  alternation: number;
  movement: number;
  load_balance: number;
}

export interface ScheduleSlot {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
  subgroup_label: string | null;
  day: number;
  period: number;
  is_double: boolean;
}

export interface ScheduleState {
  teachers: ScheduleTeacher[];
  rooms: ScheduleRoom[];
  classes: ScheduleClass[];
  subgroup_rules: ScheduleSubgroupRule[];
  subjects: ScheduleSubject[];
  curriculum: ScheduleCurriculum[];
  weights: ScheduleWeights;
  slots: ScheduleSlot[];
}

export interface ScheduleGenerateResult {
  schema_version: number;
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIME_LIMIT" | "INVALID_INPUT";
  solver_stats: { wall_ms: number; branches: number; conflicts: number; gap_percent: number; objective_value: number };
  penalties: { window: number; room_displacement: number; sanpin_parabola: number; alternation: number; movement: number; load_balance: number; total: number };
  slots: ScheduleSlot[];
  diagnostics: { infeasible_core: { reason: string; conflicting_entities: string[]; suggestion: string } | null; warnings: string[] };
}

// ---- Локализация модуля «Расписание» ----

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  General: "Общий",
  ChemistryLab: "Хим. лаборатория",
  PhysicsLab: "Физ. лаборатория",
  BiologyLab: "Биол. лаборатория",
  Informatics: "Информатика",
  LanguageLab: "Языковой кабинет",
  Gym: "Спортзал",
  Workshop: "Мастерская",
};

export const SHIFT_LABELS: Record<Shift, string> = {
  First: "Первая",
  Second: "Вторая",
};

export const STATUS_LABELS: Record<ScheduleGenerateResult["status"], string> = {
  OPTIMAL: "Оптимально",
  FEASIBLE: "Решаемо",
  INFEASIBLE: "Невозможно",
  TIME_LIMIT: "Превышено время",
  INVALID_INPUT: "Ошибка данных",
};

export const INFEASIBLE_REASON_LABELS: Record<string, string> = {
  teacher_unavailable: "Учитель недоступен в это время",
  room_unavailable: "Кабинет недоступен",
  no_suitable_room: "Нет подходящего кабинета",
  teacher_conflict: "Конфликт учителя",
  class_conflict: "Конфликт класса",
  room_conflict: "Конфликт кабинета",
  too_many_lessons: "Слишком много уроков",
  availability_violation: "Нарушение доступности",
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  teacher: "Учитель",
  room: "Кабинет",
  class: "Класс",
  subject: "Предмет",
};

export const WEIGHT_LABELS: Record<keyof ScheduleWeights, string> = {
  id: "",
  window: "Окна учителей",
  room_displacement: "Изгнание из кабинета",
  sanpin_parabola: "СанПиН-парабола",
  alternation: "Чередование",
  movement: "Миграция",
  load_balance: "Баланс нагрузки",
};

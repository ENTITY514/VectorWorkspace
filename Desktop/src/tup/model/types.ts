// Портировано из KTPHUB: src/entities/circulumPlan/model/types.tsx
// Модель ТУП (типовой учебный план): четверть -> разделы -> темы -> цели.

export interface LearningObjective {
  id: string;
  description: string;
}

export interface LearningTopic {
  name: string;
  objectives: LearningObjective[];
}

export interface LearningSection {
  name: string;
  topics: LearningTopic[];
}

export interface Quarter {
  name: string;
  repetitionInfo: string[];
  sections: LearningSection[];
}

export type AcademicPlan = Quarter[];

export interface StoredTup {
  id: string;
  name: string;
  planData: AcademicPlan;
}
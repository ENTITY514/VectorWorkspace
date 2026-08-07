// src/entities/academic-plan/model/types.ts

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

// Эта структура хранится в состоянии Redux
export interface StoredTup {
  id: string;
  name: string;
  planData: AcademicPlan;
}

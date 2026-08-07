// src/entities/explanatoryNote/model/types.ts

export interface SorGradeEntry {
  grade: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

export interface SorSubjectTable {
  subject: string;
  grades: SorGradeEntry[];
}

export interface ExplanatoryNoteData {
  id: string;
  presetName: string;
  academicYear: string;
  title: string; // e.g. "Пояснительная записка"
  
  // Basic scope
  subjectsAndGrades: string; // e.g. "по предмету «Математика», «Алгебра» и «Геометрия» в 6а, 6б, 7, 8 классах"
  
  // Regulatory framework (Нормативно-правовая база)
  gosoOrder: string;     // Приказ №348 от 03.08.2022
  impLetter: string;     // ИМП 2024-2025
  tupOrder: string;      // Приказ №500 от 08.11.2012
  tupProgramOrder: string; // Приказ №399 от 16.09.2022 / №115 для ЛУО
  
  // Additional text paragraphs for special ed or standard notes
  introParagraphs: string[];
  
  // Hours info (if applicable)
  hoursPerWeek?: number;
  totalHours?: number;
  
  // List of textbooks
  textbooks: string[];
  
  // Assessment matrix (СОР count tables)
  sorTables: SorSubjectTable[];
}

// src/entities/titlePage/model/types.ts

export interface ApprovalSignature {
  titleKz: string;
  titleRu: string;
  positionKz: string;
  positionRu: string;
  name: string;
}

export interface MethodologicalApproval {
  titleKz: string;
  titleRu: string;
  bodyKz: string;
  bodyRu: string;
  protocolNo: string;
  protocolYear: string;
  headName: string;
}

export interface TitlePageData {
  id: string;
  presetName: string;
  academicYear: string; // e.g. "2024-2025"
  
  // Top header signatures
  approvedBy: ApprovalSignature;
  agreedBy: ApprovalSignature;
  reviewedBy: MethodologicalApproval;
  
  // Document Heading
  titleKz: string;
  titleRu: string;
  
  // Special Educational Needs (ООП / ЛУО)
  isSpecialEd: boolean;
  specialEdCategoryKz?: string; // e.g. "интеллекттің жеңіл бұзылуы"
  specialEdCategoryRu?: string; // e.g. "легкое нарушение интеллекта"
  studentName?: string;         // e.g. "Тургунбаева Айсана"
  
  // Basic info
  subjectKz: string; // e.g. "математика, алгебра, геометрия"
  subjectRu: string;
  grade: string;     // e.g. "6А, 6Б, 7, 8"
  teacherName: string; // e.g. "Бабич И.Д."
  schoolName?: string;
}

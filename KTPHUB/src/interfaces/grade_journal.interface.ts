// Информация из "шапки" журнала
export interface IJournalHeader {
  className: string;
  subject: string;
  teacherName: string;
}

// Ученик
export interface IStudent {
  id: number; // Порядковый номер
  name: string;
}

// Описание колонки с оценкой
export interface IAssessmentColumn {
  id: string; // Уникальный ID, например, "col-5"
  colIndex: number; // Индекс колонки в Excel-файле
  type: 'FO' | 'SOR' | 'SOCH' | 'Quarter'; // ФО, СОР, СОЧ или четвертная
  title: string; // Например, "15/Апрель", "СОР 1", "СОЧ", "4 чтв"
  maxScore?: number;
}

// Конкретная оценка
export interface IGrade {
  studentId: number;
  assessmentId: string;
  score: string; // Храним как строку, т.к. могут быть "н", "б"
}

// Вся структура журнала
export interface IGradeJournal {
  header: IJournalHeader;
  students: IStudent[];
  assessments: IAssessmentColumn[];
  grades: IGrade[];
}
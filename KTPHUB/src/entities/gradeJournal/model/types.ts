export interface GradeJournalData {
  metaInfo: {
    classInfo: string;
    subject: string;
    teacherName: string;
  };
  headerRows: any[][];
  studentRows: any[][];
}

// src/shared/lib/i18n/types.ts

export type Language = "ru" | "kk" | "en";

export interface Translations {
  nav: {
    ktp: string;
    titlePage: string;
    explanatoryNote: string;
    gradeJournal: string;
    docAnalysis: string;
    settings: string;
    createTitlePage: string;
    createExplanatoryNote: string;
  };
  titlePage: {
    pageTitle: string;
    pageSubtitle: string;
    presets: string;
    myPresets: string;
    saveAsPreset: string;
    reset: string;
    editorTab: string;
    splitTab: string;
    previewTab: string;
    downloadDocx: string;
    printPdf: string;
    oopLabel: string;
    headerApprovalTitle: string;
    director: string;
    vicePrincipal: string;
    methodologicalCouncil: string;
    positionRu: string;
    positionKz: string;
    directorName: string;
    vicePrincipalName: string;
    protocolNo: string;
    protocolYear: string;
    moHeadName: string;
    generalInfoTitle: string;
    academicYear: string;
    grade: string;
    teacherName: string;
    subjectKz: string;
    subjectRu: string;
    titleKz: string;
    titleRu: string;
    studentName: string;
    categoryRu: string;
    categoryKz: string;
  };
  explanatoryNote: {
    pageTitle: string;
    pageSubtitle: string;
    normativeTitle: string;
    textbooksTitle: string;
    sorTablesTitle: string;
    addTextbook: string;
    addSubject: string;
    addClass: string;
    subjectsAndGrades: string;
    goso: string;
    imp: string;
    tup: string;
    tupProgram: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    add: string;
    language: string;
  };
}

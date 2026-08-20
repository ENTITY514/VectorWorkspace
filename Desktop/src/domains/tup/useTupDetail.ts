import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import type { TupDocumentDetail } from "../../types";
import { subjectName } from "../../panels/SubjectNames";
import type { ExcelColumn } from "../../lib/tup-excel";

const formatCode = (code: string): string => code.replace(/\s+/g, "");

export const SECTION_TITLES = {
  ru: {
    general: "Параграф 1. Общие положения",
    legalBasis: "Нормативная база",
    goal: "Цель обучения",
    tasks: "Задачи обучения",
    objectives: "Параграф 2. Система целей обучения",
    objectivesEmpty: "Целей для данного документа нет.",
    objectiveGradeEmpty: "Целей для",
    gradeEmpty: "класса нет.",
    dsp: "Параграф 3. Долгосрочный план",
    hours: "Учебная нагрузка",
    hoursWeek: "Часов в неделю",
    hoursYear: "Часов в учебном году",
    code: "Код",
    section: "Раздел",
    subsection: "Подраздел",
    objectiveDesc: "Цель обучения",
    grade: "класс",
    quarter: "четверть",
    sections: "Разделов нет.",
    topics: "Тем нет.",
    topic: "Тема",
    objectiveCodes: "Цели обучения",
    downloadExcel: "Скачать в Excel",
    back: "← Назад к списку",
    grades: "Классы",
    direction: "Направление",
    appendix: "Приложение",
    orderDate: "Дата приказа",
    lang: "Язык обучения",
    totalObjectives: "Всего целей",
    quartersCount: "Четвертей",
    notFilled: "Данные не заполнены.",
  },
  kz: {
    general: "1-параграф. Жалпы ережелер",
    legalBasis: "Нормативтік база",
    goal: "Оқыту мақсаты",
    tasks: "Оқыту міндеттері",
    objectives: "2-параграф. Оқу мақсаттарының жүйесі",
    objectivesEmpty: "Бұл құжат үшін мақсаттар жоқ.",
    objectiveGradeEmpty: "",
    gradeEmpty: "сыныбына мақсаттар жоқ.",
    dsp: "3-параграф. Ұзақ мерзімді жоспар",
    hours: "Оқу жүктемесі",
    hoursWeek: "Аптасына сағат",
    hoursYear: "Оқу жылындағы сағат",
    code: "Код",
    section: "Бөлім",
    subsection: "Бөлімше",
    objectiveDesc: "Оқу мақсаты",
    grade: "сынып",
    quarter: "тоқсан",
    sections: "Бөлімдер жоқ.",
    topics: "Тақырыптар жоқ.",
    topic: "Тақырып",
    objectiveCodes: "Оқу мақсаттары",
    downloadExcel: "Excel-ге жүктеу",
    back: "← Тізімге қайту",
    grades: "Сыныптар",
    direction: "Бағыты",
    appendix: "Қосымша",
    orderDate: "Бұйрық күні",
    lang: "Оқыту тілі",
    totalObjectives: "Барлығы мақсаттар",
    quartersCount: "Тоқсандар",
    notFilled: "Деректер толтырылмаған.",
  },
} as const;

export type Lang = "ru" | "kz";

export function useTupDetail(id: string) {
  const [detail, setDetail] = useState<TupDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.fetchTupDocument(id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const lang: Lang = detail?.language === "kz" ? "kz" : "ru";
  const t = SECTION_TITLES[lang];
  const subjectName_ = detail ? subjectName(detail.subjectId, detail.language) : "";

  const grades = useMemo(() => {
    if (!detail?.targetGrades) return [];
    if (detail.targetGrades.includes("-")) {
      const [lo, hi] = detail.targetGrades.split("-").map((s) => Number(s.trim()));
      if (!isNaN(lo) && !isNaN(hi)) {
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      }
    }
    const single = Number(detail.targetGrades.trim());
    return !isNaN(single) ? [single] : [];
  }, [detail?.targetGrades]);

  const objectivesByGrade = useMemo(() => {
    if (!detail) return [];
    const map = new Map<number, typeof detail.objectives>();
    for (const o of detail.objectives) {
      if (!map.has(o.grade)) map.set(o.grade, []);
      map.get(o.grade)!.push(o);
    }
    return grades.map(g => ({ grade: g, objectives: map.get(g) ?? [] }));
  }, [detail?.objectives, grades]);

  const objectivesByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of detail?.objectives ?? []) {
      const fc = formatCode(o.code);
      if (!map.has(fc)) map.set(fc, o.description);
    }
    return map;
  }, [detail?.objectives]);

  const exportWholeDocument = useMemo(() => {
    if (!detail) return undefined;
    const sheets: { sheetName: string; headers: ExcelColumn[]; rows: (string | number)[][] }[] = [];

    const generalRows: (string | number)[][] = [];
    if (detail.legalBasis) generalRows.push([t.legalBasis, detail.legalBasis]);
    if (detail.goalText) generalRows.push([t.goal, detail.goalText]);
    for (const task of detail.tasks) generalRows.push([t.tasks, task]);
    sheets.push({
      sheetName: t.general,
      headers: [{ title: t.code, width: 30 }, { title: t.objectiveDesc, width: 90 }],
      rows: generalRows,
    });

    const objectiveRows = detail.objectives.map((o) => [
      formatCode(o.code), String(o.sectionNumber), String(o.subsectionNumber), o.description,
    ]);
    sheets.push({
      sheetName: t.objectives,
      headers: [
        { title: t.code, width: 12 }, { title: t.section, width: 10 },
        { title: t.subsection, width: 12 }, { title: t.objectiveDesc, width: 80 },
      ],
      rows: objectiveRows,
    });

    const dspRows: (string | number)[][] = [];
    for (const q of detail.quarters) {
      for (const s of q.sections) {
        for (const topic of s.topics) {
          const objectivesText = topic.objectiveCodes
            .map((c) => {
              const desc = objectivesByCode.get(formatCode(c));
              return desc ? `${formatCode(c)} — ${desc}` : null;
            })
            .filter((x): x is string => x !== null)
            .join("\n");
          dspRows.push([`${q.grade} ${t.grade}, ${q.quarterNumber} ${t.quarter}`, s.name, topic.name, objectivesText]);
        }
      }
    }
    sheets.push({
      sheetName: t.dsp,
      headers: [
        { title: `${t.grade} / ${t.quarter}`, width: 20 }, { title: t.section, width: 40 },
        { title: t.topic, width: 50 }, { title: t.objectiveCodes, width: 90 },
      ],
      rows: dspRows,
    });

    const hoursRows = detail.hours.map((h) => [`${h.grade} ${t.grade}`, String(h.hoursPerWeek), String(h.hoursPerYear)]);
    sheets.push({
      sheetName: t.hours,
      headers: [
        { title: t.grade, width: 12 }, { title: t.hoursWeek, width: 18 }, { title: t.hoursYear, width: 22 },
      ],
      rows: hoursRows,
    });

    return async () => {
      const { exportToExcelMulti } = await import("../../lib/tup-excel");
      return exportToExcelMulti(`${subjectName_}_${lang === "kz" ? "толық" : "полный"}`, sheets);
    };
  }, [detail, objectivesByCode, t, lang, subjectName_]);

  return {
    detail, loading, error, lang, t, subjectName_,
    objectivesByGrade, objectivesByCode, exportWholeDocument
  };
}

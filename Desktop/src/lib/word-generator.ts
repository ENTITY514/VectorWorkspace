// Портировано из KTPHUB: src/shared/lib/word-generator.ts
// Экспорт КТП в Word (docx).
// Переработано под формат реальных КТП из Materials/Актуальные ктп:
//  - 8 колонок (№, № урока, Разделы, Темы/Содержание, Цели, Кол-во часов, Дата, Примечание);
//  - таблица по ширине страницы: A4 альбомный, фиксированная раскладка,
//    сумма ширин колонок = ширине листа минус поля;
//  - СОР встраивается в свой раздел (№ урока продолжается, «Разделы» объединены);
//  - СОЧ и повторения — объединённые строки, а не разделы.

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  BorderStyle,
  PageOrientation,
  VerticalAlign,
  TableLayoutType,
} from "docx";
import { saveBinaryFile } from "./saver";
import { IKtpLesson, KtpPlan, LessonRowType } from "../ktp/model/types";

// A4 альбомная: ширина 16838 dxa, высота 11906 dxa.
// Поля как в реальном КТП (8_класс_алгебра.docx).
const MARGIN_LEFT = 426;
const MARGIN_RIGHT = 253;
const USABLE_WIDTH = 16838 - MARGIN_LEFT - MARGIN_RIGHT; // 16159
// Ширины 8 колонок из реального КТП (сумма = 16159).
const COLUMN_WIDTHS = [447, 546, 1996, 2433, 5218, 719, 3128, 1672];

interface QuarterWorkHours {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

interface KtpData {
  subjectName: string;
  className: string;
  hoursPerWeek: number;
  totalHours: number;
  plan: KtpPlan;
  quarterWorkHours: QuarterWorkHours;
  /** Нормативная основа (A1): приказ/приложение ТУП. */
  sourceLabel?: string;
}

const invisibleBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const columnWidth = (index: number) => COLUMN_WIDTHS[index];

const objectivesKey = (lesson: IKtpLesson): string =>
  JSON.stringify(lesson.objectives.slice().sort((a, b) => a.id.localeCompare(b.id)));

const objectivesText = (lesson: IKtpLesson): string =>
  lesson.objectives.map((o) => `${o.id}: ${o.description}`).join("\n");

/** Название раздела без кодового префикса вида «8.1 » для подписи СОР. */
const sectionLabel = (name: string): string => name.replace(/^\d+(\.\d+)*\s*/, "").trim();

const createCell = (
  text: string,
  opts: { widthIndex?: number; width?: number; vMerge?: "restart" | "continue"; span?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
): TableCell => {
  const width = opts.width ?? (opts.widthIndex !== undefined ? columnWidth(opts.widthIndex) : undefined);
  return new TableCell({
    children: [new Paragraph({ text, alignment: opts.align ?? AlignmentType.LEFT })],
    ...(width !== undefined ? { width: { size: width, type: WidthType.DXA } } : {}),
    ...(opts.vMerge ? { verticalMerge: opts.vMerge } : {}),
    ...(opts.span ? { columnSpan: opts.span } : {}),
    verticalAlign: VerticalAlign.CENTER,
  });
};

const createHeaderCell = (text: string, widthIndex: number): TableCell =>
  createCell(text, { widthIndex, align: AlignmentType.CENTER });

export const generateWordDocument = (data: KtpData) => {
  const { subjectName, className, hoursPerWeek, totalHours, plan } = data;

  const rows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              text: `Календарно-тематическое планирование по предмету "${subjectName}"`,
              alignment: AlignmentType.CENTER,
            }),
          ],
          columnSpan: 8,
          borders: invisibleBorders,
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: `Класс: ${className}`, alignment: AlignmentType.CENTER })],
          columnSpan: 2,
          borders: invisibleBorders,
        }),
        new TableCell({
          children: [new Paragraph({ text: `Количество часов в неделю: ${hoursPerWeek}`, alignment: AlignmentType.CENTER })],
          columnSpan: 3,
          borders: invisibleBorders,
        }),
        new TableCell({
          children: [new Paragraph({ text: `Количество часов в год: ${totalHours}`, alignment: AlignmentType.CENTER })],
          columnSpan: 3,
          borders: invisibleBorders,
        }),
      ],
    }),
  ];

  if (data.sourceLabel) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: data.sourceLabel, alignment: AlignmentType.CENTER })],
            columnSpan: 8,
            borders: invisibleBorders,
          }),
        ],
      }),
    );
  }

  rows.push(
    new TableRow({
      children: [
        createHeaderCell("№", 0),
        createHeaderCell("№ урока", 1),
        createHeaderCell("Разделы долгосрочного плана", 2),
        createHeaderCell("Темы/Содержание раздела долгосрочного плана", 3),
        createHeaderCell("Цели обучения", 4),
        createHeaderCell("Кол-во часов", 5),
        createHeaderCell("Дата", 6),
        createHeaderCell("примечание", 7),
      ],
    })
  );

  let lessonCounter = 0;

  const quarters: { quarterInfo: IKtpLesson; lessons: IKtpLesson[] }[] = [];
  let currentQuarter: { quarterInfo: IKtpLesson; lessons: IKtpLesson[] } | null = null;

  plan.forEach((lesson) => {
    if (lesson.rowType === LessonRowType.QUARTER_HEADER) {
      if (currentQuarter) quarters.push(currentQuarter);
      currentQuarter = { quarterInfo: lesson, lessons: [] };
    } else if (currentQuarter) {
      currentQuarter.lessons.push(lesson);
    }
  });
  if (currentQuarter) quarters.push(currentQuarter);

  quarters.forEach((quarter) => {
    const quarterHours = quarter.lessons.reduce((sum, l) => sum + (l.hours || 0), 0);

    // Пасс 1: сумма часов по каждому разделу (включая встроенные СОР).
    const sectionHours = new Map<string, number>();
    let activeSection = "";
    for (const l of quarter.lessons) {
      if (l.rowType === LessonRowType.STANDARD) activeSection = l.sectionName;
      if (activeSection && (l.rowType === LessonRowType.STANDARD || l.rowType === LessonRowType.SOR)) {
        sectionHours.set(activeSection, (sectionHours.get(activeSection) ?? 0) + (l.hours || 1));
      }
    }

    rows.push(
      new TableRow({
        children: [
          createCell(quarter.quarterInfo.sectionName, { width: 10640, span: 5, align: AlignmentType.CENTER }),
          createCell(`${quarterHours} часов`, { width: 5519, span: 3, align: AlignmentType.CENTER }),
        ],
      })
    );

    // Пасс 2: рендер строк четверти по порядку.
    let lessonInSectionCounter = 0;
    let sorCounter = 0;
    let activeSectionName = "";
    let firstRowOfSection = true;
    let prevTopic: string | null = null;
    let prevObjectives: string | null = null;

    quarter.lessons.forEach((lesson) => {
      if (lesson.rowType === LessonRowType.STANDARD) {
        if (lesson.sectionName !== activeSectionName) {
          activeSectionName = lesson.sectionName;
          lessonInSectionCounter = 0;
          firstRowOfSection = true;
          prevTopic = null;
          prevObjectives = null;
        }
        lessonInSectionCounter++;
        lessonCounter++;

        const topicMerges = prevTopic !== null && lesson.lessonTopic === prevTopic;
        const objectiveMerges = prevObjectives !== null && objectivesKey(lesson) === prevObjectives;
        const sectionDisplay = `${activeSectionName} (${sectionHours.get(activeSectionName) ?? 0} часов)`;

        rows.push(
          new TableRow({
            children: [
              createCell(String(lessonCounter), { widthIndex: 0 }),
              createCell(String(lessonInSectionCounter), { widthIndex: 1 }),
              createCell(firstRowOfSection ? sectionDisplay : "", {
                widthIndex: 2,
                vMerge: firstRowOfSection ? "restart" : "continue",
              }),
              createCell(topicMerges ? "" : lesson.lessonTopic, {
                widthIndex: 3,
                vMerge: topicMerges ? "continue" : "restart",
              }),
              createCell(objectiveMerges ? "" : objectivesText(lesson), {
                widthIndex: 4,
                vMerge: objectiveMerges ? "continue" : "restart",
              }),
              createCell(String(lesson.hours), { widthIndex: 5 }),
              createCell(lesson.date, { widthIndex: 6 }),
              createCell(lesson.notes || "", { widthIndex: 7 }),
            ],
          })
        );
        firstRowOfSection = false;
        prevTopic = lesson.lessonTopic;
        prevObjectives = objectivesKey(lesson);
      } else if (lesson.rowType === LessonRowType.SOR) {
        lessonInSectionCounter++;
        lessonCounter++;
        sorCounter++;
        const sorTopic = `${prevTopic ?? lesson.lessonTopic}. СОР № ${sorCounter} «${sectionLabel(activeSectionName || lesson.sectionName)}»`;

        rows.push(
          new TableRow({
            children: [
              createCell(String(lessonCounter), { widthIndex: 0 }),
              createCell(String(lessonInSectionCounter), { widthIndex: 1 }),
              createCell("", {
                widthIndex: 2,
                vMerge: firstRowOfSection ? "restart" : "continue",
              }),
              createCell(sorTopic, { widthIndex: 3, vMerge: "restart" }),
              createCell(objectivesText(lesson), { widthIndex: 4, vMerge: "restart" }),
              createCell(String(lesson.hours), { widthIndex: 5 }),
              createCell(lesson.date, { widthIndex: 6 }),
              createCell(lesson.notes || "", { widthIndex: 7 }),
            ],
          })
        );
        firstRowOfSection = false;
        prevTopic = null;
        prevObjectives = null;
      } else if (lesson.rowType === LessonRowType.SOCH) {
        lessonCounter++;
        lessonInSectionCounter = 0;
        rows.push(
          new TableRow({
            children: [
              createCell(String(lessonCounter), { widthIndex: 0 }),
              createCell("1", { widthIndex: 1 }),
              createCell(lesson.lessonTopic, { width: 9647, span: 3, align: AlignmentType.CENTER }),
              createCell(String(lesson.hours), { widthIndex: 5 }),
              createCell(lesson.date, { widthIndex: 6 }),
              createCell(lesson.notes || "", { widthIndex: 7 }),
            ],
          })
        );
        activeSectionName = "";
        prevTopic = null;
        prevObjectives = null;
      } else if (lesson.rowType === LessonRowType.REPETITION) {
        lessonCounter++;
        lessonInSectionCounter = 0;
        rows.push(
          new TableRow({
            children: [
              createCell(String(lessonCounter), { widthIndex: 0 }),
              createCell("1", { widthIndex: 1 }),
              createCell(lesson.lessonTopic, { width: 9647, span: 3, align: AlignmentType.CENTER }),
              createCell(String(lesson.hours), { widthIndex: 5 }),
              createCell(lesson.date, { widthIndex: 6 }),
              createCell(lesson.notes || "", { widthIndex: 7 }),
            ],
          })
        );
        activeSectionName = "";
        prevTopic = null;
        prevObjectives = null;
      }
    });
  });

  const table = new Table({
    rows,
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: COLUMN_WIDTHS,
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 709,
              right: MARGIN_RIGHT,
              bottom: 284,
              left: MARGIN_LEFT,
            },
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
          },
        },
        children: [table],
      },
    ],
  });

  return Packer.toBlob(doc).then(async (blob) => {
    await saveBinaryFile(blob, `KTP_${subjectName}_${className}.docx`);
  });
};
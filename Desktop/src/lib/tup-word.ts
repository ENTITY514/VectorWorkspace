// Экспорт документа ТУП в Word (.docx).
// Структура повторяет детальный просмотр: титул + метаданные,
// Параграф 1 (общие положения), Параграф 2 (цели по классам),
// Параграф 3 (долгосрочный план), учебная нагрузка.

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  HeadingLevel,
  TextRun,
  VerticalAlign,
  TableLayoutType,
} from "docx";
import { saveBinaryFile } from "./saver";
import type { TupDocumentDetail } from "../types";
import { directionFull, languageLabel } from "../domains/tup/labels";
import type { Lang, SECTION_TITLES } from "../domains/tup/useTupDetail";

const formatCode = (code: string): string => code.replace(/\s+/g, "");

function parseGrades(targetGrades: string): number[] {
  if (!targetGrades) return [];
  if (targetGrades.includes("-")) {
    const [lo, hi] = targetGrades.split("-").map((s) => Number(s.trim()));
    if (!isNaN(lo) && !isNaN(hi)) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  const single = Number(targetGrades.trim());
  return !isNaN(single) ? [single] : [];
}

// A4 книжная: ширина 11906 dxa. Поля по 1134 dxa (2 см) => полезная ширина 9638.
const USABLE_WIDTH = 9638;

interface WordColumn {
  text: string;
  width: number;
}

const makeCell = (text: string, width: number): TableCell =>
  new TableCell({
    children: text.split("\n").map((line) => new Paragraph({ text: line })),
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
  });

const makeTable = (columns: WordColumn[], rows: string[][]): Table => {
  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(
      (c) =>
        new TableCell({
          children: [new Paragraph({ text: c.text, alignment: AlignmentType.CENTER })],
          width: { size: c.width, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
        }),
    ),
  });

  const bodyRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) => makeCell(cell, columns[i].width)),
      }),
  );

  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
  });
};

export interface TupWordData {
  detail: TupDocumentDetail;
  subjectName: string;
  lang: Lang;
  t: (typeof SECTION_TITLES)[Lang];
  objectivesByCode: Map<string, string>;
}

export async function generateTupWord(data: TupWordData) {
  const { detail, subjectName, lang, t, objectivesByCode } = data;
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      text: subjectName,
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `${t.direction}: ${directionFull(detail.direction)}` }),
        new TextRun({ text: ` · ${t.lang}: ${languageLabel(detail.language)}`, break: 1 }),
      ],
    }),
  );

  for (const meta of [
    `${t.grades}: ${detail.targetGrades}`,
    `${t.appendix}: ${detail.appendixNumber}`,
    `${t.orderDate}: ${detail.orderDate}`,
  ]) {
    children.push(new Paragraph({ text: meta, spacing: { after: 40 } }));
  }
  children.push(new Paragraph({ text: "" }));

  // Параграф 1. Общие положения.
  children.push(new Paragraph({ text: t.general, heading: HeadingLevel.HEADING_2 }));
  if (detail.legalBasis) {
    children.push(new Paragraph({ text: t.legalBasis, heading: HeadingLevel.HEADING_3 }));
    children.push(new Paragraph({ text: detail.legalBasis }));
  }
  if (detail.goalText) {
    children.push(new Paragraph({ text: t.goal, heading: HeadingLevel.HEADING_3 }));
    children.push(new Paragraph({ text: detail.goalText }));
  }
  if (detail.tasks.length > 0) {
    children.push(new Paragraph({ text: t.tasks, heading: HeadingLevel.HEADING_3 }));
    for (const task of detail.tasks) {
      children.push(new Paragraph({ children: [new TextRun({ text: "• " }), new TextRun({ text: task })] }));
    }
  }

  // Параграф 2. Система целей обучения.
  const grades = parseGrades(detail.targetGrades);
  if (grades.length > 0) {
    children.push(new Paragraph({ text: t.objectives, heading: HeadingLevel.HEADING_2 }));

    const byGrade = new Map<number, typeof detail.objectives>();
    for (const o of detail.objectives) {
      if (!byGrade.has(o.grade)) byGrade.set(o.grade, []);
      byGrade.get(o.grade)!.push(o);
    }

    for (const grade of grades) {
      const objectives = byGrade.get(grade) ?? [];
      children.push(new Paragraph({ text: `${grade} ${t.grade}`, heading: HeadingLevel.HEADING_3 }));
      if (objectives.length === 0) {
        children.push(new Paragraph({ text: `${t.objectiveGradeEmpty}${grade} ${t.gradeEmpty}` }));
      } else {
        children.push(
          makeTable(
            [
              { text: t.code, width: 964 },
              { text: t.section, width: 482 },
              { text: t.subsection, width: 482 },
              { text: t.objectiveDesc, width: 7710 },
            ],
            objectives.map((o) => [
              formatCode(o.code),
              String(o.sectionNumber),
              String(o.subsectionNumber),
              o.description,
            ]),
          ),
        );
        children.push(new Paragraph({ text: "" }));
      }
    }
  }

  // Параграф 3. Долгосрочный план.
  if (detail.quarters.length > 0) {
    children.push(new Paragraph({ text: t.dsp, heading: HeadingLevel.HEADING_2 }));

    for (const q of detail.quarters) {
      children.push(
        new Paragraph({ text: `${q.grade} ${t.grade} — ${q.quarterNumber} ${t.quarter}`, heading: HeadingLevel.HEADING_3 }),
      );
      if (q.sections.length === 0) {
        children.push(new Paragraph({ text: t.sections }));
      } else {
        for (const s of q.sections) {
          children.push(new Paragraph({ text: s.name, heading: HeadingLevel.HEADING_4 }));
          if (s.topics.length === 0) {
            children.push(new Paragraph({ text: t.topics }));
          } else {
            const rows = s.topics.map((topic) => {
              const objectivesText = topic.objectiveCodes
                .map((c) => {
                  const code = formatCode(c);
                  const desc = objectivesByCode.get(code);
                  return desc ? `${code} — ${desc}` : null;
                })
                .filter((x): x is string => x !== null)
                .join("\n");
              return [topic.name, objectivesText];
            });
            children.push(
              makeTable(
                [
                  { text: t.topic, width: 3000 },
                  { text: t.objectiveCodes, width: 6638 },
                ],
                rows,
              ),
            );
            children.push(new Paragraph({ text: "" }));
          }
        }
      }
    }
  }

  // Учебная нагрузка.
  if (detail.hours.length > 0) {
    children.push(new Paragraph({ text: t.hours, heading: HeadingLevel.HEADING_2 }));
    children.push(
      makeTable(
        [
          { text: t.grade, width: 2000 },
          { text: t.hoursWeek, width: 2500 },
          { text: t.hoursYear, width: 5138 },
        ],
        detail.hours.map((h) => [`${h.grade} ${t.grade}`, String(h.hoursPerWeek), String(h.hoursPerYear)]),
      ),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  await saveBinaryFile(blob, `${subjectName}_${lang === "kz" ? "ТУП_толық" : "ТУП_полный"}.docx`);
}
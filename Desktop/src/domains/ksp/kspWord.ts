import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  PageOrientation,
} from "docx";
import { saveBinaryFile } from "../../lib/saver";
import type { KspDocument, KspStage } from "../../types";
import { STAGE_LABEL, formatKspDate, kspFileStem, stageAssessText } from "./kspModel";

const USABLE = 16838 - 720 - 720;
const COLS = [2200, 3800, 3800, 2800, 2118];

function cell(text: string, width: number, opts: { bold?: boolean; span?: number; fill?: string } = {}) {
  const lines = (text || " ").split("\n");
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: opts.span,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    verticalAlign: VerticalAlign.TOP,
    children: lines.map((t) => new Paragraph({
      children: [new TextRun({ text: t, bold: opts.bold, size: 20, font: "Times New Roman" })],
    })),
  });
}

function metaRow(label: string, value: string, span = 4) {
  return new TableRow({
    children: [
      cell(label, COLS[0], { bold: true, fill: "F3F4F6" }),
      cell(value, USABLE - COLS[0], { span }),
    ],
  });
}

function stageText(s: KspStage): { teacher: string; student: string; assess: string; res: string } {
  return {
    teacher: s.teacherActions,
    student: s.studentActions,
    assess: stageAssessText(s),
    res: s.resources.map((r) => r.display).join(", "),
  };
}

export async function exportKspWord(doc: KspDocument): Promise<string | null> {
  const h = doc.content.header;
  const goals = h.learningObjectives.map((o) => `${o.code} ${o.text}`).join("\n");
  const lessonGoal = [h.lessonGoals.all, h.lessonGoals.most, h.lessonGoals.some].filter(Boolean).join("\n");
  const headerRows = [
    metaRow("Раздел", h.section),
    metaRow("ФИО педагога", h.teacherName || "—"),
    metaRow("Дата", formatKspDate(h.plannedDate)),
    metaRow("Класс", `«${h.className || "—"}»`),
    metaRow("Тема урока", h.topic),
    metaRow("Цели обучения в соответствии с учебной программой", goals || "—"),
    metaRow("Цель урока", lessonGoal || "—"),
    metaRow("Воспитательная задача", h.valuesComponent.text || "—"),
  ];

  const stageHead = new TableRow({
    children: [
      cell("Этап урока / время", COLS[0], { bold: true, fill: "E5E7EB" }),
      cell("Действия педагога", COLS[1], { bold: true, fill: "E5E7EB" }),
      cell("Действия учеников", COLS[2], { bold: true, fill: "E5E7EB" }),
      cell("Оценивание", COLS[3], { bold: true, fill: "E5E7EB" }),
      cell("Ресурсы", COLS[4], { bold: true, fill: "E5E7EB" }),
    ],
  });

  const stageRows = doc.content.stages.map((s) => {
    const t = stageText(s);
    const title = `${STAGE_LABEL[s.type]} (${s.durationMinutes} мин)`;
    return new TableRow({
      children: [
        cell(title, COLS[0], { bold: true }),
        cell(t.teacher, COLS[1]),
        cell(t.student, COLS[2]),
        cell(t.assess, COLS[3]),
        cell(t.res, COLS[4]),
      ],
    });
  });

  const hw = new TableRow({
    children: [
      cell("Домашнее задание", COLS[0], { bold: true, fill: "F3F4F6" }),
      cell(
        [doc.content.homework.text, doc.content.homework.checkMethod && `Проверка: ${doc.content.homework.checkMethod}`]
          .filter(Boolean)
          .join("\n"),
        USABLE - COLS[0],
        { span: 4 },
      ),
    ],
  });

  const table = new Table({
    width: { size: USABLE, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "111827" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "111827" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "111827" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "111827" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "111827" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "111827" },
    },
    rows: [...headerRows, stageHead, ...stageRows, hw],
  });

  const file = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 566, bottom: 566, left: 720, right: 720 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Краткосрочный план урока", bold: true, size: 28, font: "Times New Roman" })],
        }),
        new Paragraph({ text: "" }),
        table,
      ],
    }],
  });
  const blob = await Packer.toBlob(file);
  const name = `${kspFileStem({ className: doc.className || h.className, topic: h.topic })}.docx`;
  return saveBinaryFile(blob, name);
}

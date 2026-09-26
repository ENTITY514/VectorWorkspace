// Печатная сетка расписания в .docx — та же раскладка, что export_print.py делает в .xlsx.
// Без цветов: только тонкие чёрные линии, как на официальном школьном бланке.
// Использование: node export_print_docx.js <путь-к-json-от-export_print.py> <путь-к-docx>
"use strict";
const fs = require("fs");
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  WidthType, VerticalMergeType, AlignmentType,
  PageOrientation, VerticalAlign, BorderStyle, HeightRule, TextDirection,
} = require("docx");

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("нужно: node export_print_docx.js <in.json> <out.docx>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(inPath, "utf-8"));

// US Letter, альбомная (портретные размеры — docx-js сам разворачивает).
const PAGE_W = 12240;
const PAGE_H = 15840;
const MARGIN = 400;
const USABLE = PAGE_H - 2 * MARGIN; // ширина в альбомной ориентации

const BORDER = { style: BorderStyle.SINGLE, size: 2, color: "000000" };
const BORDER_THICK = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function cellText(text, size) {
  const lines = (text || "").split("\n").filter((x) => x.length);
  if (!lines.length) return [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })];
  return lines.map((line) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 200 },
    children: [new TextRun({ text: line, size: size || 14 })],
  }));
}

function headerCell(text, width) {
  const lines = (text || "").split("\n").filter((x) => x.length);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders: CELL_BORDERS,
    children: lines.length ? lines.map((l) => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: l, bold: true, size: 16 })],
    })) : [new Paragraph({})],
  });
}

function buildHeaderTable(sheet, header) {
  const leftW = 3800;
  const centerW = USABLE - 2 * leftW;
  const rightW = leftW;

  const agreeHeader = header && header.agree ? header.agree : {
    title: "«Согласовано»",
    role: "Председатель родительского комитета:",
    name: "Чоп Н.А.",
  };
  const approveHeader = header && header.approve ? header.approve : {
    title: "«Утверждаю»",
    role: "Директор школы:",
    name: "Мельников П.В.",
  };
  const title = (sheet && sheet.title) || (header && header.title) || "Расписание уроков на I полугодие";
  const subtitle = (sheet && sheet.subtitle) || (header && header.subtitle) || "КГУ «Песчанская СОШ №1» 2026-2027 учебный год";

  const leftCell = new TableCell({
    width: { size: leftW, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: NO_BORDERS,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: agreeHeader.title, bold: true, size: 20 })],
      }),
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: agreeHeader.role, size: 17 })],
      }),
      new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: agreeHeader.name, bold: true, size: 19 })],
      }),
    ],
  });

  const centerChildren = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 10, after: 30 },
      children: [new TextRun({ text: title, bold: true, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [new TextRun({ text: subtitle, bold: true, size: 18 })],
    }),
  ];

  if ((sheet.name === "ЛУО" || sheet.name === "ДО") && !sheet.title) {
    centerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: `(${sheet.name})`, italics: true, bold: true, size: 17 })],
      })
    );
  }

  const centerCell = new TableCell({
    width: { size: centerW, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: NO_BORDERS,
    children: centerChildren,
  });

  const rightCell = new TableCell({
    width: { size: rightW, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: NO_BORDERS,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: approveHeader.title, bold: true, size: 20 })],
      }),
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: approveHeader.role, size: 17 })],
      }),
      new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: approveHeader.name, bold: true, size: 19 })],
      }),
    ],
  });

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [leftW, centerW, rightW],
    rows: [
      new TableRow({
        children: [leftCell, centerCell, rightCell],
      }),
    ],
  });
}

function buildFooter(footer) {
  const compiler = (footer && footer.compiler) || "Составила: ЗДУВР Квашнина Е.В.";
  return new Paragraph({
    spacing: { before: 140, after: 0 },
    children: [
      new TextRun({ text: compiler, bold: true, size: 19 }),
    ],
  });
}

function buildSheetTable(sheet) {
  const dayColW = 450;
  const lessonColW = 450;
  const nClass = sheet.columns.length;
  const classColW = Math.max(650, Math.floor((USABLE - dayColW - lessonColW) / nClass));
  const colWidths = [dayColW, lessonColW, ...sheet.columns.map(() => classColW)];
  const cellSize = nClass > 12 ? 13 : 15;

  const rows = [];
  rows.push(new TableRow({
    tableHeader: true,
    children: [
      headerCell("", dayColW),
      headerCell("", lessonColW),
      ...sheet.columns.map((c) => headerCell(c, classColW)),
    ],
  }));

  for (const day of sheet.days) {
    day.rows.forEach((r, i) => {
      const isFirst = i === 0;
      const isLast = i === day.rows.length - 1;
      const cells = [];
      cells.push(new TableCell({
        width: { size: dayColW, type: WidthType.DXA },
        verticalMerge: isFirst ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
        verticalAlign: VerticalAlign.CENTER,
        textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT,
        borders: {
          top: isFirst ? BORDER_THICK : BORDER,
          bottom: isLast ? BORDER_THICK : BORDER,
          left: BORDER, right: BORDER,
        },
        children: isFirst ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: day.label, bold: true, size: 17 })],
        })] : [new Paragraph({})],
      }));
      cells.push(new TableCell({
        width: { size: lessonColW, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: isFirst ? BORDER_THICK : BORDER,
          bottom: isLast ? BORDER_THICK : BORDER,
          left: BORDER, right: BORDER,
        },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: String(r.period), bold: true, size: 17 })],
        })],
      }));
      r.cells.forEach((text) => {
        cells.push(new TableCell({
          width: { size: classColW, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: {
            top: isFirst ? BORDER_THICK : BORDER,
            bottom: isLast ? BORDER_THICK : BORDER,
            left: BORDER, right: BORDER,
          },
          children: cellText(text, cellSize),
        }));
      });
      rows.push(new TableRow({
        cantSplit: true,
        height: { value: 240, rule: HeightRule.ATLEAST },
        children: cells,
      }));
    });
  }

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: colWidths,
    rows,
  });
}

const sections = data.sheets
  .filter((sheet) => sheet.columns.length && sheet.days.length)
  .map((sheet) => ({
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    children: [
      buildHeaderTable(sheet, data.header),
      new Paragraph({ spacing: { before: 0, after: 60 } }),
      buildSheetTable(sheet),
      buildFooter(data.footer),
    ],
  }));

const doc = new Document({ sections });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("записан", outPath);
});

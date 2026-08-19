// src/shared/services/explanatoryNoteDocxService.ts

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";
import { ExplanatoryNoteData } from "../../entities/explanatoryNote/model/types";

const tableGridBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

export const exportExplanatoryNoteToDocx = async (data: ExplanatoryNoteData) => {
  const children: any[] = [
    // Header Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: data.title,
          bold: true,
          size: 28, // 14pt
        }),
      ],
    }),

    // Intro sentence
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Календарно-тематическое планирование ${data.subjectsAndGrades} составлено в соответствии с ${data.gosoOrder} и с учетом ${data.impLetter}`,
        }),
      ],
    }),
  ];

  // Add intro paragraphs
  data.introParagraphs.forEach((para) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200 },
        children: [new TextRun({ text: para })],
      })
    );
  });

  // Textbooks section
  if (data.textbooks && data.textbooks.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: "Используемые для обучения учебники:",
            bold: true,
          }),
        ],
      })
    );

    data.textbooks.forEach((tb) => {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [new TextRun({ text: tb })],
        })
      );
    });
  }

  // SOR Tables section
  if (data.sorTables && data.sorTables.length > 0) {
    data.sorTables.forEach((st) => {
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 150 },
          children: [
            new TextRun({
              text: `Количество процедур суммативного оценивания за раздел/сквозную тему по предмету «${st.subject}»`,
              bold: true,
            }),
          ],
        })
      );

      const tableHeaderRow = new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                text: "Класс",
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "Класс", bold: true })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "1 четверть", bold: true })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "2 четверть", bold: true })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "3 четверть", bold: true })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "4 четверть", bold: true })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      });

      const tableRows = [tableHeaderRow];

      st.grades.forEach((g) => {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    text: g.grade,
                    alignment: AlignmentType.LEFT,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    text: String(g.q1),
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    text: String(g.q2),
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    text: String(g.q3),
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    text: String(g.q4),
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
            ],
          })
        );
      });

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableGridBorders,
          rows: tableRows,
        })
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134,
              bottom: 1134,
              left: 1417,
              right: 1134,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Пояснительная_Записка_${data.academicYear}.docx`);
};

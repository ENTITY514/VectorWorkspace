// src/shared/services/titlePageDocxService.ts

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
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";
import { TitlePageData } from "../../entities/titlePage/model/types";

export const exportTitlePageToDocx = async (data: TitlePageData) => {
  const invisibleBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: invisibleBorders,
    rows: [
      new TableRow({
        children: [
          // Column 1: Approved By (Директор)
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            borders: invisibleBorders,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `«${data.approvedBy.titleKz}»`, bold: true }),
                ],
              }),
              new Paragraph({ text: data.approvedBy.positionKz }),
              new Paragraph({ text: "" }),
              new Paragraph({
                children: [
                  new TextRun({ text: data.approvedBy.titleRu, bold: true }),
                ],
              }),
              new Paragraph({ text: data.approvedBy.positionRu }),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "_____________" }),
              new Paragraph({
                children: [
                  new TextRun({ text: data.approvedBy.name, bold: true }),
                ],
              }),
            ],
          }),

          // Column 2: Agreed By (Завуч)
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            borders: invisibleBorders,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `«${data.agreedBy.titleKz}»`, bold: true }),
                ],
              }),
              new Paragraph({ text: data.agreedBy.positionKz }),
              new Paragraph({ text: "" }),
              new Paragraph({
                children: [
                  new TextRun({ text: data.agreedBy.titleRu, bold: true }),
                ],
              }),
              new Paragraph({ text: data.agreedBy.positionRu }),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "_____________" }),
              new Paragraph({
                children: [
                  new TextRun({ text: data.agreedBy.name, bold: true }),
                ],
              }),
            ],
          }),

          // Column 3: Reviewed By (МО)
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            borders: invisibleBorders,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${data.reviewedBy.protocolNo ? `№ ${data.reviewedBy.protocolNo} хаттама` : "№ ___ хаттама"} ${data.reviewedBy.protocolYear || "2024"} ж ${data.reviewedBy.titleKz}`,
                  }),
                ],
              }),
              new Paragraph({ text: "" }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${data.reviewedBy.titleRu} ${data.reviewedBy.protocolNo ? `Протокол № ${data.reviewedBy.protocolNo}` : "Протокол № ________"}`,
                  }),
                ],
              }),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "_______________" }),
              new Paragraph({
                children: [
                  new TextRun({ text: data.reviewedBy.headName, bold: true }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const children: any[] = [
    headerTable,
    new Paragraph({ text: "", spacing: { after: 400 } }),
    
    // Main Kazakh Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: data.titleKz,
          bold: true,
          size: 28, // 14pt
        }),
      ],
    }),

    // Main Russian Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: data.titleRu,
          bold: true,
          size: 28, // 14pt
        }),
      ],
    }),

    // Subject lines
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({ text: "Пән\nПредмет: ", bold: true, size: 24 }),
        new TextRun({ text: `${data.subjectKz}`, size: 24 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({ text: "Сынып\nКласс: ", bold: true, size: 24 }),
        new TextRun({ text: `${data.grade}`, size: 24 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({ text: "Мұғалім\nУчитель: ", bold: true, size: 24 }),
        new TextRun({ text: `${data.teacherName}`, size: 24 }),
      ],
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // 2 cm
              bottom: 1134,
              left: 1417, // 2.5 cm
              right: 1134,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanGradeName = data.grade.replace(/[/\\?%*:|"<>]/g, "-");
  saveAs(blob, `Титулка_${cleanGradeName}_${data.academicYear}.docx`);
};

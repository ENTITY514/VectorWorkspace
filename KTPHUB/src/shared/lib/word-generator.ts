

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
} from "docx";
import { saveAs } from "file-saver";
import {
  IKtpLesson,
  KtpPlan,
  LessonRowType,
} from "../../entities/ktp/model/types";

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
}

export const generateWordDocument = (data: KtpData) => {
  const { subjectName, className, hoursPerWeek, totalHours, plan } = data;

  const invisibleBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const createHeaderCell = (text: string) => {
    return new TableCell({
      children: [
        new Paragraph({
          text: text,
          alignment: AlignmentType.CENTER,
        }),
      ],
      verticalAlign: VerticalAlign.CENTER,
    });
  };

  const tableHeaderRow = new TableRow({
    children: [
      createHeaderCell("№"),
      createHeaderCell("№ урока"),
      createHeaderCell("Разделы долгосрочного планирования"),
      createHeaderCell("Темы долгосрочного планирования"),
      createHeaderCell("Цели обучения"),
      createHeaderCell("Кол-во часов"),
      createHeaderCell("Запланированная дата"),
      createHeaderCell("Фактическая дата"),
      createHeaderCell("Примечание"),
    ],
  });

  const rows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              text: `Календарно-тематическое планирование по предмету "${subjectName}"`, // Corrected: escaped double quotes within template literal
              alignment: AlignmentType.CENTER,
            }),
          ],
          columnSpan: 9,
          borders: invisibleBorders,
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              text: `Класс: ${className}`,
              alignment: AlignmentType.CENTER,
            }),
          ],
          columnSpan: 3,
          borders: invisibleBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              text: `Количество часов в неделю: ${hoursPerWeek}`,
              alignment: AlignmentType.CENTER,
            }),
          ],
          columnSpan: 3,
          borders: invisibleBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              text: `Количество часов в год: ${totalHours}`,
              alignment: AlignmentType.CENTER,
            }),
          ],
          columnSpan: 3,
          borders: invisibleBorders,
        }),
      ],
    }),
  ];

  rows.push(tableHeaderRow);

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
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ text: quarter.quarterInfo.sectionName, alignment: AlignmentType.CENTER }),
            ],
            columnSpan: 5,
          }),
          new TableCell({
            children: [
              new Paragraph({ text: `${quarter.quarterInfo.hours} часов`, alignment: AlignmentType.CENTER }),
            ],
            columnSpan: 4,
          }),
        ],
      })
    );

    const sectionsMap = new Map<string, Map<string, Map<string, IKtpLesson[]>>>();
    quarter.lessons.forEach((lesson) => {
      const sectionName = lesson.sectionName;
      const topicName = lesson.lessonTopic;
      const objectivesKey = JSON.stringify(lesson.objectives.slice().sort((a, b) => a.id.localeCompare(b.id)));

      if (!sectionsMap.has(sectionName)) {
        sectionsMap.set(sectionName, new Map());
      }
      const topicsMap = sectionsMap.get(sectionName)!;

      if (!topicsMap.has(topicName)) {
        topicsMap.set(topicName, new Map());
      }
      const objectivesMap = topicsMap.get(topicName)!;

      if (!objectivesMap.has(objectivesKey)) {
        objectivesMap.set(objectivesKey, []);
      }
      objectivesMap.get(objectivesKey)!.push(lesson);
    });

    let lessonInSectionCounter = 0;
    sectionsMap.forEach((topicsMap, sectionName) => {
      let totalHoursInSection = 0;
      topicsMap.forEach((objectivesMap) => {
        objectivesMap.forEach((lessons) => {
          lessons.forEach((lesson) => {
            totalHoursInSection += lesson.hours;
          });
        });
      });
      const sectionDisplayName = `${sectionName} (${totalHoursInSection} часов)`;

      let isFirstTopicInSection = true;
      topicsMap.forEach((objectivesMap, topicName) => {
        let isFirstObjectiveInTopic = true;
        objectivesMap.forEach((lessons, objectivesKey) => {
          const objectivesText = JSON.parse(objectivesKey)
            .map((obj: any) => `${obj.id}: ${obj.description}`)
            .join("\n");
            
          lessons.forEach((lesson, lessonIndex) => {
            lessonCounter++;
            lessonInSectionCounter++;

            const sectionVMerge = isFirstTopicInSection && isFirstObjectiveInTopic && lessonIndex === 0 ? "restart" : "continue";
            const topicVMerge = isFirstObjectiveInTopic && lessonIndex === 0 ? "restart" : "continue";
            const objectiveVMerge = lessonIndex === 0 ? "restart" : "continue";

            rows.push(
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: String(lessonCounter), alignment: AlignmentType.LEFT })] }),
                  new TableCell({ children: [new Paragraph({ text: String(lessonInSectionCounter), alignment: AlignmentType.LEFT })] }),
                  new TableCell({ children: [new Paragraph({ text: sectionDisplayName, alignment: AlignmentType.LEFT })], verticalMerge: sectionVMerge }),
                  new TableCell({ children: [new Paragraph({ text: topicName, alignment: AlignmentType.LEFT })], verticalMerge: topicVMerge }),
                  new TableCell({ children: [new Paragraph({ text: objectivesText, alignment: AlignmentType.LEFT })], verticalMerge: objectiveVMerge }),
                  new TableCell({ children: [new Paragraph({ text: String(lesson.hours), alignment: AlignmentType.LEFT })] }),
                  new TableCell({ children: [new Paragraph({ text: "", alignment: AlignmentType.LEFT })] }),
                  new TableCell({ children: [new Paragraph({ text: "", alignment: AlignmentType.LEFT })] }),
                  new TableCell({ children: [new Paragraph({ text: lesson.notes || "", alignment: AlignmentType.LEFT })] }),
                ],
              })
            );
          });
          isFirstObjectiveInTopic = false;
        });
        isFirstTopicInSection = false;
      });
      lessonInSectionCounter = 0; // Reset for next section
    });
  });

  const table = new Table({
    rows: rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    columnWidths: [4, 4, 10, 20, 30, 4, 8, 8, 12].map(
      (w) => (w / 100) * 9500
    ), // Convert percentage to DXA
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
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

  Packer.toBlob(doc).then((blob) => {
    saveAs(blob, `KTP_${subjectName}_${className}.docx`);
  });
};

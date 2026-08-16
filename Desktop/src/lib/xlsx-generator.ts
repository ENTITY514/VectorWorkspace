// Портировано из KTPHUB: src/shared/lib/xlsx-generator.ts
// Экспорт КТП в Excel (xlsx) и в формат Kundelik.kz.

import * as XLSX from "xlsx";
import { IKtpLesson, LessonRowType } from "../ktp/model/types";

const formatDate = (dateString: string) => {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${day}.${month}.${year}`;
};

export const generateXlsx = (ktp: IKtpLesson[], fileName: string) => {
  const header = ["Дата", "Тема урока", "Домашнее задание к следующему уроку"];
  const data = [header];
  let currentQuarter = "";

  let i = 0;
  while (i < ktp.length) {
    const lesson = ktp[i];

    if (lesson.rowType === LessonRowType.QUARTER_HEADER) {
      const match = lesson.sectionName.match(/(\d+)/);
      if (match) {
        currentQuarter = match[1];
      }
      i++;
      continue;
    }

    if (lesson.rowType === LessonRowType.SOCH) {
      let topic = `Суммативное оценивание за ${currentQuarter} четверть`;
      topic = `${lesson.lessonNumber}. ${topic}`;
      data.push([formatDate(lesson.date), topic, ""]);
      i++;
      continue;
    }

    // Check for merged lessons
    if (lesson.date && i + 1 < ktp.length && ktp[i + 1].date === lesson.date) {
      const mergedLessons = [lesson];
      let reason = lesson.notes || "";

      // Collect all consecutive lessons with the same date
      let j = i + 1;
      while (j < ktp.length && ktp[j].date === lesson.date) {
        mergedLessons.push(ktp[j]);
        if (ktp[j].notes) reason = ktp[j].notes; // Use the note from any of the merged lessons
        j++;
      }

      const lessonNumbers = mergedLessons.map((l) => l.lessonNumber).join(", ");
      const lessonTopics = mergedLessons.map((l) => l.lessonTopic).join(" / ");
      const reasonText = reason ? `(${reason})` : "";

      const mergedTheme = `${lessonNumbers}. ${lessonTopics} ${reasonText}`;
      data.push([formatDate(lesson.date), mergedTheme, ""]);

      i += mergedLessons.length; // Advance the loop counter by the number of merged lessons
    } else {
      const lessonTopicWithNumber = `${lesson.lessonNumber}. ${lesson.lessonTopic}`;
      const lessonHours = lesson.hours || 1;
      for (let j = 0; j < lessonHours; j++) {
        data.push([formatDate(lesson.date), lessonTopicWithNumber, ""]);
      }
      i++;
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "КТП");

  // Auto-fit columns
  const colWidths = data[0].map((_: string, index: number) => {
    return { wch: Math.max(...data.map((row) => (row[index] ? row[index].toString().length : 0))) };
  });
  worksheet["!cols"] = colWidths;

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export const generateKundelikXlsx = (ktp: IKtpLesson[], fileName: string) => {
  const header = ["№ п/п", "Дата", "Тема урока", "Домашнее задание", "Цели обучения"];
  const data = [header];
  let currentQuarter = "";

  let i = 0;
  while (i < ktp.length) {
    const lesson = ktp[i];

    if (lesson.rowType === LessonRowType.QUARTER_HEADER) {
      const match = lesson.sectionName.match(/(\d+)/);
      if (match) currentQuarter = match[1];
      i++;
      continue;
    }

    const objectivesText = (lesson.objectives || [])
      .map((o) => o.description)
      .join("; ");

    if (lesson.rowType === LessonRowType.SOCH) {
      const topic = `СОР/СОЧ: Суммативное оценивание за ${currentQuarter} четверть`;
      data.push([
        String(lesson.lessonNumber),
        formatDate(lesson.date),
        topic,
        "",
        objectivesText,
      ]);
      i++;
      continue;
    }

    data.push([
      String(lesson.lessonNumber),
      formatDate(lesson.date),
      lesson.lessonTopic,
      "",
      objectivesText,
    ]);
    i++;
  }

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Импорт Кунделик");

  // Auto-fit columns
  const colWidths = [
    { wch: 8 }, // № п/п
    { wch: 14 }, // Дата
    { wch: 45 }, // Тема урока
    { wch: 25 }, // Домашнее задание
    { wch: 50 }, // Цели обучения
  ];
  worksheet["!cols"] = colWidths;

  XLSX.writeFile(workbook, `${fileName}_Kundelik.xlsx`);
};
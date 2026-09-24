import * as XLSX from "xlsx";
import { saveBinaryFile } from "../../lib/saver";
import type { KspDocument } from "../../types";
import { STAGE_LABEL, formatKspDate, kspFileStem, stageAssessText } from "./kspModel";

export async function exportKspExcel(doc: KspDocument): Promise<string | null> {
  const h = doc.content.header;
  const goals = h.learningObjectives.map((o) => `${o.code} ${o.text}`).join("\n");
  const lessonGoal = [h.lessonGoals.all, h.lessonGoals.most, h.lessonGoals.some].filter(Boolean).join("\n");

  const rows: (string | number)[][] = [
    ["Краткосрочный план урока"],
    [],
    ["Раздел", h.section || "—"],
    ["ФИО педагога", h.teacherName || "—"],
    ["Дата", formatKspDate(h.plannedDate)],
    ["Класс", `«${doc.className || h.className || "—"}»`],
    ["Тема урока", h.topic || "—"],
    ["Цели обучения в соответствии с учебной программой", goals || "—"],
    ["Цель урока", lessonGoal || "—"],
    ["Воспитательная задача", h.valuesComponent.text || "—"],
    [],
    ["Этап урока / время", "Действия педагога", "Действия учеников", "Оценивание", "Ресурсы"],
    ...doc.content.stages.map((s) => [
      `${STAGE_LABEL[s.type]} (${s.durationMinutes} мин)`,
      s.teacherActions,
      s.studentActions,
      stageAssessText(s),
      s.resources.map((r) => r.display).join(", "),
    ]),
    [],
    [
      "Домашнее задание",
      [doc.content.homework.text, doc.content.homework.checkMethod && `Проверка: ${doc.content.homework.checkMethod}`]
        .filter(Boolean)
        .join("\n") || "—",
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 42 }, { wch: 42 }, { wch: 32 }, { wch: 22 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "КСП");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return saveBinaryFile(bytes, `${kspFileStem({ className: doc.className || h.className, topic: h.topic })}.xlsx`);
}

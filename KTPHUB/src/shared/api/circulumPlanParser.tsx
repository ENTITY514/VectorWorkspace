// src/shared/api/academicPlanParser.ts

import * as XLSX from "xlsx";
import {
  AcademicPlan,
  Quarter,
  LearningSection,
  LearningTopic,
  LearningObjective,
} from "../../entities/circulumPlan/model/types";

const REGEX_QUARTER = /(^\d+)[\s-]+(четверть|тоқсан)/i;
const REGEX_REPETITION = /(повторение|қайталау)/i;
const REGEX_OBJECTIVE = /(^[\d.]+)\s(.+)/;

/**
 * Парсер для современных файлов .xlsx.
 * Корректно обрабатывает объединенные ячейки с помощью анализа '!merges'.
 */
const _parseXlsxFormat = (worksheet: XLSX.WorkSheet): AcademicPlan => {
  const merges = worksheet["!merges"] || [];

  const getCellValue = (rowIndex: number, colIndex: number): string => {
    let targetCellAddress: string | undefined;

    for (const range of merges) {
      if (
        rowIndex >= range.s.r &&
        rowIndex <= range.e.r &&
        colIndex >= range.s.c &&
        colIndex <= range.e.c
      ) {
        targetCellAddress = XLSX.utils.encode_cell({
          r: range.s.r,
          c: range.s.c,
        });
        break;
      }
    }

    if (!targetCellAddress) {
      targetCellAddress = XLSX.utils.encode_cell({
        r: rowIndex,
        c: colIndex,
      });
    }

    const cell = worksheet[targetCellAddress];
    return XLSX.utils.format_cell(cell) || "";
  };

  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
  }) as string[][];
  const plan: AcademicPlan = [];
  let currentQuarter: Quarter | null = null;
  let currentSection: LearningSection | null = null;
  let currentTopic: LearningTopic | null = null;

  for (let i = 0; i < jsonData.length; i++) {
    const colA = getCellValue(i, 0).trim();
    const colB = getCellValue(i, 1).trim();
    const colC = getCellValue(i, 2).trim();

    if (!colA && !colB && !colC) continue;

    if (colA && REGEX_QUARTER.test(colA)) {
      currentQuarter = { name: colA, repetitionInfo: [], sections: [] };
      plan.push(currentQuarter);
      currentSection = null;
      currentTopic = null;
      continue;
    }

    if (!currentQuarter) continue;

    if (colB && REGEX_REPETITION.test(colB)) {
      currentQuarter.repetitionInfo.push(colB);
      continue;
    }

    if (colA && !REGEX_QUARTER.test(colA)) {
      // Только если название раздела изменилось, создаем новый
      if (!currentSection || currentSection.name !== colA) {
        currentSection = { name: colA, topics: [] };
        currentQuarter.sections.push(currentSection);
        currentTopic = null; // При смене раздела всегда сбрасываем текущую тему
      }
    }

    if (
      currentSection &&
      colB &&
      colB.length > 2 &&
      !REGEX_REPETITION.test(colB)
    ) {
      // Только если название темы изменилось, создаем новую
      if (!currentTopic || currentTopic.name !== colB) {
        currentTopic = { name: colB, objectives: [] };
        currentSection.topics.push(currentTopic);
      }
    }

    // Добавляем цель к текущей теме.
    // Эта логика сработает и для первой цели новой темы, и для последующих целей,
    // так как currentTopic сохраняется между итерациями, если colB пуста.
    if (currentTopic && colC) {
      const objectiveMatch = colC.match(REGEX_OBJECTIVE);
      if (objectiveMatch) {
        const objective: LearningObjective = {
          id: objectiveMatch[1],
          description: objectiveMatch[2],
        };
        currentTopic.objectives.push(objective);
      } else if (currentTopic.objectives.length > 0) {
        const lastObjective =
          currentTopic.objectives[currentTopic.objectives.length - 1];
        lastObjective.description += " " + colC;
      }
    }
  }
  return plan;
};

/**
 * Парсер для старых файлов .xls (Excel 97-2003).
 * Этот парсер не полагается на свойство `!merges` и обрабатывает структуру,
 * где значение объединенной ячейки находится только в первой строке.
 */
const _parseXlsFormat = (worksheet: XLSX.WorkSheet): AcademicPlan => {
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "", // Важно для получения пустых строк вместо undefined
  }) as string[][];
  const plan: AcademicPlan = [];
  let currentQuarter: Quarter | null = null;
  let currentSection: LearningSection | null = null;
  let currentTopic: LearningTopic | null = null;

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    const colA = (row[0] || "").trim();
    const colB = (row[1] || "").trim();
    const colC = (row[2] || "").trim();

    if (!colA && !colB && !colC) continue;

    if (colA && REGEX_QUARTER.test(colA)) {
      currentQuarter = { name: colA, repetitionInfo: [], sections: [] };
      plan.push(currentQuarter);
      currentSection = null;
      currentTopic = null;
      continue;
    }

    if (!currentQuarter) continue;

    if (colB && REGEX_REPETITION.test(colB)) {
      currentQuarter.repetitionInfo.push(colB);
      continue;
    }

    if (colA && !REGEX_QUARTER.test(colA)) {
      if (!currentSection || currentSection.name !== colA) {
        currentSection = { name: colA, topics: [] };
        currentQuarter.sections.push(currentSection);
        currentTopic = null;
      }
    }

    if (
      currentSection &&
      colB &&
      colB.length > 2 &&
      !REGEX_REPETITION.test(colB)
    ) {
      if (!currentTopic || currentTopic.name !== colB) {
        currentTopic = { name: colB, objectives: [] };
        currentSection.topics.push(currentTopic);
      }
    }

    if (currentTopic && colC) {
      const lines = colC.split('\n'); // Разделяем содержимое ячейки по строкам
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue; // Пропускаем пустые строки

        const objectiveMatch = trimmedLine.match(REGEX_OBJECTIVE);
        if (objectiveMatch) {
          // Найдена новая цель с кодом
          const objective: LearningObjective = {
            id: objectiveMatch[1],
            description: objectiveMatch[2].trim(),
          };
          currentTopic.objectives.push(objective);
        } else if (currentTopic.objectives.length > 0) {
          // Если строка не начинается с кода, считаем ее продолжением предыдущей цели
          const lastObjective =
            currentTopic.objectives[currentTopic.objectives.length - 1];
          lastObjective.description += " " + trimmedLine;
        }
      }
    }
  }
  return plan;
};


export const parseAcademicPlan = (file: File): Promise<AcademicPlan> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Не удалось прочитать файл.");
        }

        const workbook = XLSX.read(data, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        let plan: AcademicPlan;

        // Определяем формат файла и выбираем соответствующий парсер
        if (file.name.toLowerCase().endsWith(".xls")) {
          console.log("Используется парсер для старого формата .xls.");
          plan = _parseXlsFormat(worksheet);
        } else {
          console.log("Используется парсер для современного формата .xlsx.");
          plan = _parseXlsxFormat(worksheet);
        }

        if (plan.length === 0) {
          throw new Error("Структура файла не соответствует шаблону ТУП.");
        }

        resolve(plan);
      } catch (err: any) {
        console.error("Критическая ошибка парсинга:", err);
        reject(err.message || "Не удалось обработать файл.");
      }
    };

    reader.onerror = () => {
      reject(new Error("Ошибка чтения файла."));
    };

    reader.readAsArrayBuffer(file);
  });
};

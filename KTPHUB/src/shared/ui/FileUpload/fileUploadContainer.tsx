import React, { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Typography } from "@mui/material";
import {
  AcademicPlan,
  Quarter,
  LearningSection,
  LearningTopic,
  LearningObjective,
} from "../../../entities/circulumPlan/model/types";
import FileUploaderUI from "../../../modules/FileUploaderUI";

const REGEX_QUARTER = /(^\d+) четверть/i;
const REGEX_REPETITION = /повторение/i;
const REGEX_OBJECTIVE = /(^[\d\.]+)\s(.+)/;

interface FileUploadContainerProps {
  onUploadSuccess: (data: AcademicPlan) => void;
}

const FileUploadContainer: React.FC<FileUploadContainerProps> = ({
  onUploadSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploaded, setIsUploaded] = useState(false);

  const parseXLSX = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
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
            if (!currentSection || currentSection.name !== colA) {
              currentSection = { name: colA, topics: [] };
              currentQuarter.sections.push(currentSection);
              currentTopic = null;
            }
          }

          // ✅ ИЗМЕНЕНИЕ: Добавлена проверка на длину имени темы (> 2 символов)
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
            const objectiveMatch = colC.match(REGEX_OBJECTIVE);
            if (objectiveMatch) {
              const objective: LearningObjective = {
                id: objectiveMatch[1],
                description: objectiveMatch[2],
              };
              currentTopic.objectives.push(objective);
            }
          }
        }

        if (plan.length === 0) {
          throw new Error(
            "Не удалось найти '1-четверть'. Проверьте, что эта надпись есть в первом столбце."
          );
        }

        localStorage.setItem("academicPlanData", JSON.stringify(plan));
        setIsUploaded(true);
        setError(null);
        onUploadSuccess(plan);
        alert("План успешно загружен и структурирован!");
      } catch (err: any) {
        console.error("Критическая ошибка парсинга:", err);
        setError(err.message || "Не удалось обработать файл.");
        setIsUploaded(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setIsUploaded(false);
    parseXLSX(file);
  }, []);

  return (
    <>
      <FileUploaderUI
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
        isUploaded={isUploaded}
      />
      {error && (
        <Typography color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </>
  );
};

export default FileUploadContainer;

// src/features/UploadTup/index.tsx

import React, { useState, useCallback } from "react";
import { Typography } from "@mui/material";
import { addTup } from "../../entities/circulumPlan/model/slice";
import FileUploaderUI from "../../modules/FileUploaderUI";
import { parseAcademicPlan } from "../../shared/api/circulumPlanParser";
import { useAppDispatch } from "../../shared/lib/hooks";

export const UploadTup: React.FC = () => {
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setIsUploading(true);
      setError(null);
      try {
        const plan = await parseAcademicPlan(file);
        dispatch(addTup(plan));
        alert("План успешно загружен и структурирован!");
      } catch (err: any) {
        setError(err.message || "Не удалось обработать файл.");
      } finally {
        setIsUploading(false);
      }
    },
    [dispatch]
  );

  return (
    <>
      <FileUploaderUI
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
        isUploaded={!isUploading && !!selectedFile && !error} // Улучшенная логика
      />
      {error && (
        <Typography color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </>
  );
};

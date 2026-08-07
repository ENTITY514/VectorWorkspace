import React, { useState, useCallback } from 'react';
import { Container, Typography, Alert, CircularProgress, Box } from '@mui/material';
import FileUploaderUI from '../../modules/FileUploaderUI';
import { useAppDispatch, useAppSelector } from '../../shared/lib/hooks';
import { parseGradeJournal } from '../../shared/api/gradeJournalParser';
import { setJournalData, setJournalLoading, setJournalError } from '../../entities/gradeJournal/model/slice';
import GradeJournalTable from '../../widgets/GradeJournalTable';
import SorSochAnalysis from '../../widgets/SorSochAnalysis';

const GradeJournalPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { journalData, status, error } = useAppSelector((state) => state.gradeJournal);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      dispatch(setJournalLoading());
      try {
        const parsedData = await parseGradeJournal(file);
        dispatch(setJournalData(parsedData));
      } catch (err: any) {
        dispatch(setJournalError(err.message || "Не удалось обработать файл."));
      }
    },
    [dispatch]
  );

  return (
    <Container maxWidth="xl">
      <Typography variant="h4" component="h1" gutterBottom>
        Анализ журнала оценок
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Загрузите файл журнала успеваемости (в формате .xlsx или .xls).
      </Typography>

      <FileUploaderUI 
        onFileSelect={handleFileSelect} 
        selectedFile={selectedFile}
        isUploaded={status === 'succeeded'}
      />

      <Box sx={{ mt: 4 }}>
        {status === 'loading' && <CircularProgress />}
        {status === 'failed' && <Alert severity="error">{error}</Alert>}
        {status === 'succeeded' && journalData && (
          <>
            <GradeJournalTable data={journalData} />
            <SorSochAnalysis />
          </>
        )}
      </Box>
    </Container>
  );
};

export default GradeJournalPage;
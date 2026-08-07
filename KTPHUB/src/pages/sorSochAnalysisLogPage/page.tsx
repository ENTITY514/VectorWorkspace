import React, { useState, useCallback } from 'react';
import { Container, Typography, Alert, Box, Paper, Tooltip, IconButton } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { parseSorSochAnalysis } from '../../shared/api/sorSochAnalysisParser';
import FileUploaderUI from '../../modules/FileUploaderUI';

interface ParsedData {
  fileName: string;
  fileType: string;
  content: string;
}

const ParsedDataDisplay: React.FC<{ data: ParsedData }> = ({ data }) => {
  const [copySuccess, setCopySuccess] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.content);
      setCopySuccess('Скопировано!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      setCopySuccess('Ошибка копирования');
    }
  };

  return (
    <Paper elevation={2} sx={{ mt: 4, p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Результаты парсинга</Typography>
        <Tooltip title={copySuccess || 'Копировать'}>
          <IconButton onClick={handleCopy}>
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography variant="body2" color="text.secondary">
        <strong>Файл:</strong> {data.fileName}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <strong>Тип:</strong> {data.fileType}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, maxHeight: '500px', overflowY: 'auto', backgroundColor: '#f5f5f5' }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <code>{data.content}</code>
        </pre>
      </Paper>
    </Paper>
  );
};

const SorSochAnalysisLogPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setParsedData(null);
    setIsLoading(true);
    try {
      const content = await parseSorSochAnalysis(file);
      setParsedData({
        fileName: file.name,
        fileType: file.type || 'unknown',
        content,
      });
    } catch (err: any) {
      setError(err.message || "Не удалось обработать файл.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Анализ структуры документов
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Загрузите сюда документ (.xlsx, .xls, .docx). Его структура будет разобрана и представлена в формате JSON.
      </Typography>
      <FileUploaderUI 
        onFileSelect={handleFileSelect} 
        selectedFile={selectedFile}
        isUploaded={!!parsedData}
        isLoading={isLoading}
        acceptedFiles=".xlsx,.xls,.docx"
      />
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {parsedData && <ParsedDataDisplay data={parsedData} />}
    </Container>
  );
};

export default SorSochAnalysisLogPage;

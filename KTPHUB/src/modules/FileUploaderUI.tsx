import React, { useCallback, useRef, DragEvent } from 'react';
import { Box, Typography, Paper, CircularProgress, ListItem, ListItemText } from '@mui/material';
import { styled } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

const DropzoneArea = styled(Paper)(({ theme }) => ({
  border: `2px dashed ${theme.palette.divider}`,
  padding: theme.spacing(4),
  textAlign: 'center',
  cursor: 'pointer',
  backgroundColor: '#fafafa',
  transition: 'background-color 0.3s',
  '&:hover': {
    backgroundColor: '#f0f0f0',
  },
}));

interface FileUploaderUIProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  isUploaded: boolean;
  isLoading?: boolean;
  acceptedFiles?: string;
}

const FileUploaderUI: React.FC<FileUploaderUIProps> = ({
  onFileSelect,
  selectedFile,
  isUploaded,
  isLoading = false,
  acceptedFiles = "*/*",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Обработчики для drag-and-drop
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && acceptedFiles.split(',').some(type => file.name.endsWith(type.trim()) || type.trim() === '*/*')) {
      onFileSelect(file);
    }
  }, [onFileSelect, acceptedFiles]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const openFileDialog = () => {
    if (isLoading) return;
    inputRef.current?.click();
  };
  
  return (
    <Box sx={{ maxWidth: 600, margin: 'auto' }}>
      <DropzoneArea
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFileDialog}
        sx={{
          cursor: isLoading ? 'not-allowed' : 'pointer',
          backgroundColor: isLoading ? '#f5f5f5' : '#fafafa'
        }}
      >
        <input
          type="file"
          ref={inputRef}
          onChange={handleFileChange}
          accept={acceptedFiles}
          hidden
          disabled={isLoading}
        />
        {isLoading ? <CircularProgress /> : (isUploaded && selectedFile) ? <CheckCircleIcon color="success" sx={{ fontSize: 40 }} /> : <UploadFileIcon color="action" sx={{ fontSize: 40 }} />}
        <Typography sx={{ mt: 1 }}>
          {selectedFile ? selectedFile.name : 'Перетащите файл сюда или нажмите для выбора'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Поддерживаемые форматы: {acceptedFiles}
        </Typography>
      </DropzoneArea>

      {selectedFile && (
        <ListItem sx={{ mt: 2, border: '1px solid #ddd', borderRadius: 1 }}>
            <InsertDriveFileIcon sx={{ mr: 2 }}/>
            <ListItemText
              primary={selectedFile.name}
              secondary={`${(selectedFile.size / 1024).toFixed(2)} KB`}
            />
            {isLoading && <CircularProgress size={24} sx={{ mr: 2 }} />}
            {isUploaded && !isLoading && <CheckCircleIcon color="success" />}
        </ListItem>
      )}
    </Box>
  );
};

export default FileUploaderUI;
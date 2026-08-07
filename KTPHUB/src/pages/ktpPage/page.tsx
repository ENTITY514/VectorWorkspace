// src/pages/KtpPage/index.tsx (Новый файл, заменяющий старый page.tsx)

import React from "react";
import { Container, Typography, Paper } from "@mui/material";
import { UploadTup } from "../../features/UploadTup";
import { EditableTupList } from "../../features/EditableTupList";
import { SavedKtpList } from "../../features/SavedKtpList";

const KtpPage: React.FC = () => {
  return (
    <Container maxWidth="md">
      <Typography variant="h4" component="h1" gutterBottom>
        Календарно-тематические планы
      </Typography>

      <Paper elevation={2} sx={{ mb: 4, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Загрузить новый ТУП
        </Typography>
        <UploadTup />
      </Paper>

      <Paper elevation={2} sx={{ mb: 4, p: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Загруженные ТУП
        </Typography>
        <EditableTupList />
      </Paper>

      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Сохраненные КТП
        </Typography>
        <SavedKtpList />
      </Paper>
    </Container>
  );
};

export default KtpPage;
// src/features/TitlePageEditor/ui/DocumentTitleFields.tsx

import React from "react";
import { Grid, TextField, Typography, Box } from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import { updateActiveTitlePage } from "../../../entities/titlePage/model/slice";

export const DocumentTitleFields: React.FC = () => {
  const dispatch = useAppDispatch();
  const titlePage = useAppSelector((state) => state.titlePage.activeTitlePage);

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: "bold", mb: 2 }}>
        2. Основная информация и Заголовок
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            label="Учебный год"
            value={titlePage.academicYear}
            onChange={(e) => dispatch(updateActiveTitlePage({ academicYear: e.target.value }))}
            helperText="Например: 2024-2025"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            label="Класс / Сынып"
            value={titlePage.grade}
            onChange={(e) => dispatch(updateActiveTitlePage({ grade: e.target.value }))}
            helperText="Например: 6А, 6Б, 7, 8 или 6Б"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            label="ФИО Учителя / Мұғалім"
            value={titlePage.teacherName}
            onChange={(e) => dispatch(updateActiveTitlePage({ teacherName: e.target.value }))}
            helperText="Например: Бабич И.Д."
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            size="small"
            label="Предмет (каз)"
            value={titlePage.subjectKz}
            onChange={(e) => dispatch(updateActiveTitlePage({ subjectKz: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            size="small"
            label="Предмет (рус)"
            value={titlePage.subjectRu}
            onChange={(e) => dispatch(updateActiveTitlePage({ subjectRu: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Заголовок на казахском языке"
            value={titlePage.titleKz}
            onChange={(e) => dispatch(updateActiveTitlePage({ titleKz: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Заголовок на русском языке"
            value={titlePage.titleRu}
            onChange={(e) => dispatch(updateActiveTitlePage({ titleRu: e.target.value }))}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

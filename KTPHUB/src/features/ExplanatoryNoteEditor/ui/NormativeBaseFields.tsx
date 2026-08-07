// src/features/ExplanatoryNoteEditor/ui/NormativeBaseFields.tsx

import React from "react";
import { Grid, TextField, Typography, Box } from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import { updateActiveNote } from "../../../entities/explanatoryNote/model/slice";

export const NormativeBaseFields: React.FC = () => {
  const dispatch = useAppDispatch();
  const note = useAppSelector((state) => state.explanatoryNote.activeNote);

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: "bold", mb: 2 }}>
        1. Название и Нормативно-правовая база
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            label="Учебный год"
            value={note.academicYear}
            onChange={(e) => dispatch(updateActiveNote({ academicYear: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <TextField
            fullWidth
            size="small"
            label="Предметы и классы"
            value={note.subjectsAndGrades}
            onChange={(e) => dispatch(updateActiveNote({ subjectsAndGrades: e.target.value }))}
            helperText="Например: по предмету «Математика», «Алгебра» и «Геометрия» в 6а, 6б, 7, 8 классах"
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Государственный стандарт (ГОСО)"
            value={note.gosoOrder}
            onChange={(e) => dispatch(updateActiveNote({ gosoOrder: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Инструктивно-методическое письмо (ИМП)"
            value={note.impLetter}
            onChange={(e) => dispatch(updateActiveNote({ impLetter: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Типовой учебный план (ТУП)"
            value={note.tupOrder}
            onChange={(e) => dispatch(updateActiveNote({ tupOrder: e.target.value }))}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Типовая учебная программа (ТУПр)"
            value={note.tupProgramOrder}
            onChange={(e) => dispatch(updateActiveNote({ tupProgramOrder: e.target.value }))}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

// src/features/TitlePageEditor/ui/SpecialEdFields.tsx

import React from "react";
import {
  FormControlLabel,
  Checkbox,
  Grid,
  TextField,
  Typography,
  Paper,
  Box,
} from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import { updateActiveTitlePage } from "../../../entities/titlePage/model/slice";

export const SpecialEdFields: React.FC = () => {
  const dispatch = useAppDispatch();
  const titlePage = useAppSelector((state) => state.titlePage.activeTitlePage);

  const handleToggle = (checked: boolean) => {
    dispatch(
      updateActiveTitlePage({
        isSpecialEd: checked,
        specialEdCategoryKz: checked
          ? titlePage.specialEdCategoryKz || "интеллекттің жеңіл бұзылуы"
          : undefined,
        specialEdCategoryRu: checked
          ? titlePage.specialEdCategoryRu || "легкое нарушение интеллекта"
          : undefined,
      })
    );
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderColor: titlePage.isSpecialEd ? "secondary.main" : "divider",
          backgroundColor: titlePage.isSpecialEd ? "#fcf4ff" : "#fff",
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={titlePage.isSpecialEd}
              onChange={(e) => handleToggle(e.target.checked)}
              color="secondary"
            />
          }
          label={
            <Typography variant="subtitle1" fontWeight="bold">
              Особые образовательные потребности (ООП / Инклюзия / ЛУО)
            </Typography>
          }
        />

        {titlePage.isSpecialEd && (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="ФИО Обучающегося"
                value={titlePage.studentName || ""}
                onChange={(e) => dispatch(updateActiveTitlePage({ studentName: e.target.value }))}
                placeholder="Например: Тургунбаева Айсана"
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Категория (рус)"
                value={titlePage.specialEdCategoryRu || ""}
                onChange={(e) =>
                  dispatch(updateActiveTitlePage({ specialEdCategoryRu: e.target.value }))
                }
                placeholder="легкое нарушение интеллекта"
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Категория (каз)"
                value={titlePage.specialEdCategoryKz || ""}
                onChange={(e) =>
                  dispatch(updateActiveTitlePage({ specialEdCategoryKz: e.target.value }))
                }
                placeholder="интеллекттің жеңіл бұзылуы"
              />
            </Grid>
          </Grid>
        )}
      </Paper>
    </Box>
  );
};

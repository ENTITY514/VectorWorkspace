// src/features/TitlePageEditor/ui/HeaderApprovalFields.tsx

import React from "react";
import { Grid, TextField, Typography, Paper, Box } from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import { updateActiveTitlePage } from "../../../entities/titlePage/model/slice";

export const HeaderApprovalFields: React.FC = () => {
  const dispatch = useAppDispatch();
  const titlePage = useAppSelector((state) => state.titlePage.activeTitlePage);

  const handleApprovedChange = (field: string, value: string) => {
    dispatch(
      updateActiveTitlePage({
        approvedBy: { ...titlePage.approvedBy, [field]: value },
      })
    );
  };

  const handleAgreedChange = (field: string, value: string) => {
    dispatch(
      updateActiveTitlePage({
        agreedBy: { ...titlePage.agreedBy, [field]: value },
      })
    );
  };

  const handleReviewedChange = (field: string, value: string) => {
    dispatch(
      updateActiveTitlePage({
        reviewedBy: { ...titlePage.reviewedBy, [field]: value },
      })
    );
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: "bold", mb: 2 }}>
        1. Блоки согласования и утверждения (Шапка документа)
      </Typography>

      <Grid container spacing={2}>
        {/* Block 1: Approved By (Директор) */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, backgroundColor: "#fafafa" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              Утверждаю (Директор)
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Должность (рус)"
              value={titlePage.approvedBy.positionRu}
              onChange={(e) => handleApprovedChange("positionRu", e.target.value)}
              sx={{ mb: 1.5 }}
            />
            <TextField
              fullWidth
              size="small"
              label="Должность (каз)"
              value={titlePage.approvedBy.positionKz}
              onChange={(e) => handleApprovedChange("positionKz", e.target.value)}
              sx={{ mb: 1.5 }}
            />
            <TextField
              fullWidth
              size="small"
              label="ФИО Директора"
              value={titlePage.approvedBy.name}
              onChange={(e) => handleApprovedChange("name", e.target.value)}
            />
          </Paper>
        </Grid>

        {/* Block 2: Agreed By (Завуч) */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, backgroundColor: "#fafafa" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              Согласовано (Завуч)
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Должность (рус)"
              value={titlePage.agreedBy.positionRu}
              onChange={(e) => handleAgreedChange("positionRu", e.target.value)}
              sx={{ mb: 1.5 }}
            />
            <TextField
              fullWidth
              size="small"
              label="Должность (каз)"
              value={titlePage.agreedBy.positionKz}
              onChange={(e) => handleAgreedChange("positionKz", e.target.value)}
              sx={{ mb: 1.5 }}
            />
            <TextField
              fullWidth
              size="small"
              label="ФИО Завуча"
              value={titlePage.agreedBy.name}
              onChange={(e) => handleAgreedChange("name", e.target.value)}
            />
          </Paper>
        </Grid>

        {/* Block 3: Reviewed By (Метод. объединение / МО) */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, backgroundColor: "#fafafa" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              Рассмотрено на заседании МО
            </Typography>
            <Grid container spacing={1} sx={{ mb: 1.5 }}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="№ Протокола"
                  value={titlePage.reviewedBy.protocolNo}
                  onChange={(e) => handleReviewedChange("protocolNo", e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Год протокола"
                  value={titlePage.reviewedBy.protocolYear}
                  onChange={(e) => handleReviewedChange("protocolYear", e.target.value)}
                />
              </Grid>
            </Grid>
            <TextField
              fullWidth
              size="small"
              label="ФИО Руководителя МО"
              value={titlePage.reviewedBy.headName}
              onChange={(e) => handleReviewedChange("headName", e.target.value)}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

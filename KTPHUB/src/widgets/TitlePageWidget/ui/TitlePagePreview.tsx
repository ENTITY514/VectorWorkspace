// src/widgets/TitlePageWidget/ui/TitlePagePreview.tsx

import React from "react";
import { Box, Typography, Grid, Paper } from "@mui/material";
import { TitlePageData } from "../../../entities/titlePage/model/types";

interface TitlePagePreviewProps {
  data: TitlePageData;
}

export const TitlePagePreview: React.FC<TitlePagePreviewProps> = ({ data }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        maxWidth: "800px",
        minHeight: "1000px",
        margin: "0 auto",
        p: { xs: 3, sm: 5 },
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "'Times New Roman', Times, serif",
        boxSizing: "border-box",
        boxShadow: "0px 4px 20px rgba(0,0,0,0.15)",
        position: "relative",
      }}
    >
      {/* 3 Columns Header Block */}
      <Grid container spacing={2} sx={{ mb: 6, fontSize: "0.95rem" }}>
        {/* Approved By */}
        <Grid size={{ xs: 4 }}>
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            «{data.approvedBy.titleKz}»
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.approvedBy.positionKz}
          </Typography>
          <Box sx={{ height: 12 }} />
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.approvedBy.titleRu}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.approvedBy.positionRu}
          </Typography>
          <Box sx={{ height: 20 }} />
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            _____________
          </Typography>
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.approvedBy.name}
          </Typography>
        </Grid>

        {/* Agreed By */}
        <Grid size={{ xs: 4 }}>
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            «{data.agreedBy.titleKz}»
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.agreedBy.positionKz}
          </Typography>
          <Box sx={{ height: 12 }} />
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.agreedBy.titleRu}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.agreedBy.positionRu}
          </Typography>
          <Box sx={{ height: 20 }} />
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            _____________
          </Typography>
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.agreedBy.name}
          </Typography>
        </Grid>

        {/* Reviewed By */}
        <Grid size={{ xs: 4 }}>
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.reviewedBy.protocolNo ? `№ ${data.reviewedBy.protocolNo} хаттама` : "№ ___ хаттама"} {data.reviewedBy.protocolYear || "2024"} ж {data.reviewedBy.titleKz}
          </Typography>
          <Box sx={{ height: 12 }} />
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.reviewedBy.titleRu} {data.reviewedBy.protocolNo ? `Протокол № ${data.reviewedBy.protocolNo}` : "Протокол № ________"}
          </Typography>
          <Box sx={{ height: 20 }} />
          <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
            _______________
          </Typography>
          <Typography fontWeight="bold" variant="body2" sx={{ fontFamily: "inherit" }}>
            {data.reviewedBy.headName}
          </Typography>
        </Grid>
      </Grid>

      {/* Main Title Section */}
      <Box sx={{ textAlign: "center", mt: 8, mb: 8 }}>
        <Typography
          variant="h6"
          sx={{
            fontFamily: "inherit",
            fontWeight: "bold",
            fontSize: "1.25rem",
            mb: 3,
            lineHeight: 1.4,
          }}
        >
          {data.titleKz}
        </Typography>

        <Typography
          variant="h6"
          sx={{
            fontFamily: "inherit",
            fontWeight: "bold",
            fontSize: "1.25rem",
            lineHeight: 1.4,
          }}
        >
          {data.titleRu}
        </Typography>
      </Box>

      {/* Bottom Information */}
      <Box sx={{ mt: 10, pl: 2, fontSize: "1.1rem" }}>
        <Box sx={{ mb: 2 }}>
          <Typography component="span" fontWeight="bold" sx={{ fontFamily: "inherit", display: "inline-block", width: 140 }}>
            Пән<br />Предмет:
          </Typography>
          <Typography component="span" sx={{ fontFamily: "inherit", ml: 2 }}>
            {data.subjectKz}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography component="span" fontWeight="bold" sx={{ fontFamily: "inherit", display: "inline-block", width: 140 }}>
            Сынып<br />Класс:
          </Typography>
          <Typography component="span" sx={{ fontFamily: "inherit", ml: 2 }}>
            {data.grade}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography component="span" fontWeight="bold" sx={{ fontFamily: "inherit", display: "inline-block", width: 140 }}>
            Мұғалім<br />Учитель:
          </Typography>
          <Typography component="span" sx={{ fontFamily: "inherit", ml: 2 }}>
            {data.teacherName}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

// src/pages/titlePage/page.tsx

import React, { useState } from "react";
import {
  Container,
  Typography,
  Box,
  Button,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";

import { useAppSelector } from "../../shared/lib/hooks";
import { useTranslation } from "../../shared/lib/i18n";
import { exportTitlePageToDocx } from "../../shared/services/titlePageDocxService";
import { TitlePageEditorWidget, TitlePagePreview } from "../../widgets/TitlePageWidget";

const TitlePageGeneratorPage: React.FC = () => {
  const { t } = useTranslation();
  const activeTitlePage = useAppSelector((state) => state.titlePage.activeTitlePage);
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");

  const handleExport = () => {
    exportTitlePageToDocx(activeTitlePage);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Container maxWidth="xl" sx={{ pb: 6 }}>
      {/* Header Bar */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
        spacing={2}
        sx={{ mb: 4 }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold">
            {t.titlePage.pageTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t.titlePage.pageSubtitle}
          </Typography>
        </Box>

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
            size="small"
          >
            <ToggleButton value="edit">
              <EditIcon sx={{ mr: 0.5 }} fontSize="small" /> {t.titlePage.editorTab}
            </ToggleButton>
            <ToggleButton value="split">
              <ViewColumnIcon sx={{ mr: 0.5 }} fontSize="small" /> {t.titlePage.splitTab}
            </ToggleButton>
            <ToggleButton value="preview">
              <VisibilityIcon sx={{ mr: 0.5 }} fontSize="small" /> {t.titlePage.previewTab}
            </ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            {t.titlePage.downloadDocx}
          </Button>

          <Button
            variant="outlined"
            color="secondary"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
          >
            {t.titlePage.printPdf}
          </Button>
        </Stack>
      </Stack>

      {/* Main Content Area */}
      {viewMode === "split" && (
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <TitlePageEditorWidget />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <Box sx={{ position: "sticky", top: 20 }}>
              <TitlePagePreview data={activeTitlePage} />
            </Box>
          </Grid>
        </Grid>
      )}

      {viewMode === "edit" && (
        <Box sx={{ maxWidth: "900px", margin: "0 auto" }}>
          <TitlePageEditorWidget />
        </Box>
      )}

      {viewMode === "preview" && (
        <Box sx={{ py: 2 }}>
          <TitlePagePreview data={activeTitlePage} />
        </Box>
      )}
    </Container>
  );
};

export default TitlePageGeneratorPage;

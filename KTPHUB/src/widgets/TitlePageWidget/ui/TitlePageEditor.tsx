// src/widgets/TitlePageWidget/ui/TitlePageEditor.tsx

import React from "react";
import { Paper, Divider } from "@mui/material";
import { PresetSelector } from "../../../features/TitlePageEditor/ui/PresetSelector";
import { HeaderApprovalFields } from "../../../features/TitlePageEditor/ui/HeaderApprovalFields";
import { DocumentTitleFields } from "../../../features/TitlePageEditor/ui/DocumentTitleFields";
import { SpecialEdFields } from "../../../features/TitlePageEditor/ui/SpecialEdFields";

export const TitlePageEditorWidget: React.FC = () => {
  return (
    <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
      <PresetSelector />
      <Divider sx={{ my: 3 }} />
      <HeaderApprovalFields />
      <Divider sx={{ my: 3 }} />
      <SpecialEdFields />
      <Divider sx={{ my: 3 }} />
      <DocumentTitleFields />
    </Paper>
  );
};

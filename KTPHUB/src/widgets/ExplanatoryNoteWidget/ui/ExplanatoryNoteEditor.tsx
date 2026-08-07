// src/widgets/ExplanatoryNoteWidget/ui/ExplanatoryNoteEditor.tsx

import React from "react";
import { Paper, Divider } from "@mui/material";
import { ExplanatoryPresetSelector } from "../../../features/ExplanatoryNoteEditor/ui/ExplanatoryPresetSelector";
import { NormativeBaseFields } from "../../../features/ExplanatoryNoteEditor/ui/NormativeBaseFields";
import { TextbooksEditor } from "../../../features/ExplanatoryNoteEditor/ui/TextbooksEditor";
import { SorTableEditor } from "../../../features/ExplanatoryNoteEditor/ui/SorTableEditor";

export const ExplanatoryNoteEditorWidget: React.FC = () => {
  return (
    <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
      <ExplanatoryPresetSelector />
      <Divider sx={{ my: 3 }} />
      <NormativeBaseFields />
      <Divider sx={{ my: 3 }} />
      <TextbooksEditor />
      <Divider sx={{ my: 3 }} />
      <SorTableEditor />
    </Paper>
  );
};

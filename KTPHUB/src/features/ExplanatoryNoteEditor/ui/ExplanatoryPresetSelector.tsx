// src/features/ExplanatoryNoteEditor/ui/ExplanatoryPresetSelector.tsx

import React, { useState } from "react";
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Stack,
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import {
  selectNotePreset,
  saveCurrentNoteAsCustom,
  resetNoteToDefault,
} from "../../../entities/explanatoryNote/model/slice";

export const ExplanatoryPresetSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const presets = useAppSelector((state) => state.explanatoryNote.presets);
  const customNotes = useAppSelector((state) => state.explanatoryNote.customNotes);
  const activeNote = useAppSelector((state) => state.explanatoryNote.activeNote);

  const [openDialog, setOpenDialog] = useState(false);
  const [customName, setCustomName] = useState("");

  const handleSelect = (id: string) => {
    dispatch(selectNotePreset(id));
  };

  const handleSaveCustom = () => {
    if (customName.trim()) {
      dispatch(saveCurrentNoteAsCustom(customName.trim()));
      setCustomName("");
      setOpenDialog(false);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
        <FormControl fullWidth size="small">
          <InputLabel id="exp-note-preset-label">Выберите шаблон пояснительной записки</InputLabel>
          <Select
            labelId="exp-note-preset-label"
            value={activeNote.id}
            label="Выберите шаблон пояснительной записки"
            onChange={(e) => handleSelect(e.target.value)}
          >
            <MenuItem disabled value="">
              <em>— Шаблоны из материалов —</em>
            </MenuItem>
            {presets.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.presetName}
              </MenuItem>
            ))}
            {customNotes.length > 0 && [
              <MenuItem key="divider-custom-notes" disabled value="">
                <em>— Мои сохраненные шаблоны —</em>
              </MenuItem>,
              ...customNotes.map((cp) => (
                <MenuItem key={cp.id} value={cp.id}>
                  {cp.presetName}
                </MenuItem>
              )),
            ]}
          </Select>
        </FormControl>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<BookmarkIcon />}
            onClick={() => setOpenDialog(true)}
            sx={{ whitespace: "nowrap" }}
          >
            Сохранить шаблон
          </Button>

          <Button
            variant="text"
            color="warning"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={() => dispatch(resetNoteToDefault())}
            sx={{ whitespace: "nowrap" }}
          >
            Сброс
          </Button>
        </Stack>
      </Stack>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Сохранить пояснительную записку как шаблон</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Название шаблона"
            fullWidth
            variant="outlined"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Отмена</Button>
          <Button onClick={handleSaveCustom} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

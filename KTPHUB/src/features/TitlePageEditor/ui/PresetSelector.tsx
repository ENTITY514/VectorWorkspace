// src/features/TitlePageEditor/ui/PresetSelector.tsx

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
  Chip,
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import {
  selectPreset,
  saveCurrentAsCustom,
  resetToDefault,
} from "../../../entities/titlePage/model/slice";

export const PresetSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const presets = useAppSelector((state) => state.titlePage.presets);
  const customTitlePages = useAppSelector((state) => state.titlePage.customTitlePages);
  const activeTitlePage = useAppSelector((state) => state.titlePage.activeTitlePage);

  const [openDialog, setOpenDialog] = useState(false);
  const [customName, setCustomName] = useState("");

  const handleSelect = (id: string) => {
    dispatch(selectPreset(id));
  };

  const handleSaveCustom = () => {
    if (customName.trim()) {
      dispatch(saveCurrentAsCustom(customName.trim()));
      setCustomName("");
      setOpenDialog(false);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
        <FormControl fullWidth size="small">
          <InputLabel id="title-page-preset-label">Выберите шаблон (Прессет)</InputLabel>
          <Select
            labelId="title-page-preset-label"
            value={activeTitlePage.id}
            label="Выберите шаблон (Прессет)"
            onChange={(e) => handleSelect(e.target.value)}
          >
            <MenuItem disabled value="">
              <em>— Готовые шаблоны из материалов —</em>
            </MenuItem>
            {presets.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.presetName}
              </MenuItem>
            ))}
            {customTitlePages.length > 0 && [
              <MenuItem key="divider-custom" disabled value="">
                <em>— Мои сохраненные шаблоны —</em>
              </MenuItem>,
              ...customTitlePages.map((cp) => (
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
            onClick={() => dispatch(resetToDefault())}
            sx={{ whitespace: "nowrap" }}
          >
            Сброс
          </Button>
        </Stack>
      </Stack>

      {activeTitlePage.isSpecialEd && (
        <Box sx={{ mt: 1 }}>
          <Chip
            label={`ООП / ЛУО: ${activeTitlePage.studentName || "Ученик не указан"}`}
            color="secondary"
            size="small"
          />
        </Box>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Сохранить как новый шаблон</DialogTitle>
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

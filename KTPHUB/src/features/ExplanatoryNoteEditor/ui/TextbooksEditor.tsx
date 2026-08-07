// src/features/ExplanatoryNoteEditor/ui/TextbooksEditor.tsx

import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Button,
  Stack,
  TextField,
  Paper,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import { updateActiveNote } from "../../../entities/explanatoryNote/model/slice";

export const TextbooksEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const textbooks = useAppSelector((state) => state.explanatoryNote.activeNote.textbooks || []);

  const [newTextbook, setNewTextbook] = useState("");

  const handleUpdate = (index: number, value: string) => {
    const updated = [...textbooks];
    updated[index] = value;
    dispatch(updateActiveNote({ textbooks: updated }));
  };

  const handleRemove = (index: number) => {
    const updated = textbooks.filter((_, i) => i !== index);
    dispatch(updateActiveNote({ textbooks: updated }));
  };

  const handleAdd = () => {
    if (newTextbook.trim()) {
      const lines = newTextbook
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length > 0) {
        dispatch(updateActiveNote({ textbooks: [...textbooks, ...lines] }));
        setNewTextbook("");
      }
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: "bold", mb: 2 }}>
        2. Список используемых учебников
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, backgroundColor: "#fafafa" }}>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          {textbooks.map((tb, index) => (
            <Stack key={index} direction="row" spacing={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                value={tb}
                onChange={(e) => handleUpdate(index, e.target.value)}
              />
              <IconButton color="error" size="small" onClick={() => handleRemove(index)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>

        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            placeholder="Добавить наименование учебника, автора и издательство..."
            value={newTextbook}
            onChange={(e) => setNewTextbook(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            sx={{ whitespace: "nowrap" }}
          >
            Добавить
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};

// src/features/EditableTupList/index.tsx

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  TextField,
  IconButton,
  Typography,
  Box,
} from "@mui/material";
import BackupTableIcon from "@mui/icons-material/BackupTable";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { renameTup, removeTup } from "../../entities/circulumPlan/model/slice";
import { useAppDispatch, useAppSelector } from "../../shared/lib/hooks";

export const EditableTupList: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const tupList = useAppSelector((state) => state.academicPlan.tupList);
  const [editingTupId, setEditingTupId] = useState<string | null>(null);

  const handleFinishEditing = (id: string, newName: string) => {
    dispatch(renameTup({ id, newName }));
    setEditingTupId(null);
  };

  const handleOpenTupView = (tupId: string) => {
    navigate(`/tup-view/${tupId}`);
  };

  const handleDeleteTup = (tupId: string) => {
    if (window.confirm("Вы уверены, что хотите удалить этот ТУП?")) {
      dispatch(removeTup(tupId));
    }
  };

  if (tupList.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Загруженных ТУП пока нет.
      </Typography>
    );
  }

  return (
    <List>
      {tupList.map((tup) => (
        <ListItem
          key={tup.id}
          disablePadding
          secondaryAction={
            <Box>
              <IconButton edge="end" onClick={() => setEditingTupId(tup.id)}>
                <EditIcon />
              </IconButton>
              <IconButton edge="end" onClick={() => handleDeleteTup(tup.id)}>
                <DeleteIcon />
              </IconButton>
            </Box>
          }
        >
          {editingTupId === tup.id ? (
            <TextField
              defaultValue={tup.name}
              onBlur={(e) => handleFinishEditing(tup.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleFinishEditing(
                    tup.id,
                    (e.target as HTMLInputElement).value
                  );
                }
              }}
              variant="outlined"
              size="small"
              autoFocus
              sx={{ ml: 2, flexGrow: 1 }}
            />
          ) : (
            <ListItemButton onClick={() => handleOpenTupView(tup.id)}>
              <ListItemIcon>
                <BackupTableIcon />
              </ListItemIcon>
              <ListItemText
                primary={tup.name}
                secondary={`Содержит ${tup.planData.length} четвертей`}
              />
            </ListItemButton>
          )}
        </ListItem>
      ))}
    </List>
  );
};
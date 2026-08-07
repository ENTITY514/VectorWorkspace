import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../shared/lib/hooks";
import {
  loadKtpsFromLocalStorage,
  setKtpForEditing,
  updateKtpName,
  deleteKtp,
  SavedKtp,
} from "../../entities/ktp/model/slice";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { RootState } from "../../store/store";
import { usePublishKtp } from "../PublishKtp";
import { useAuth } from "../../entities/session";

export const SavedKtpList: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { savedKtps } = useAppSelector((state: RootState) => state.ktpEditor);
  const { isAuthenticated } = useAuth();
  const { publish, loading } = usePublishKtp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    dispatch(loadKtpsFromLocalStorage());
  }, [dispatch]);

  const handleEdit = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(name);
  };

  const handleSave = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dispatch(updateKtpName({ id, name: editingName }));
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Вы уверены, что хотите удалить этот КТП?")) {
      dispatch(deleteKtp(id));
    }
  };

  const handlePublish = async (e: React.MouseEvent, ktp: SavedKtp) => {
    e.stopPropagation();
    try {
      await publish(ktp);
      alert("КТП опубликовано в каталог");
    } catch {
      // error surfaced in hook; keep quiet for list density
    }
  };

  const handleOpenEditor = (id: string) => {
    if (editingId !== id) {
      dispatch(setKtpForEditing(id));
      navigate(`/ktp-editor/${id}`);
    }
  };

  return (
    <List>
      {savedKtps.map((ktp: SavedKtp) => (
        <ListItem
          key={ktp.id}
          disablePadding
          secondaryAction={
            <>
              {isAuthenticated && (
                <Tooltip title="Опубликовать">
                  <IconButton
                    disabled={loading}
                    onClick={(e) => void handlePublish(e, ktp)}
                  >
                    <CloudUploadIcon />
                  </IconButton>
                </Tooltip>
              )}
              <IconButton
                onClick={(e) =>
                  editingId === ktp.id
                    ? handleSave(e, ktp.id)
                    : handleEdit(e, ktp.id, ktp.name)
                }
              >
                {editingId === ktp.id ? <SaveIcon /> : <EditIcon />}
              </IconButton>
              <IconButton onClick={(e) => handleDelete(e, ktp.id)}>
                <DeleteIcon />
              </IconButton>
            </>
          }
        >
          <ListItemButton onClick={() => handleOpenEditor(ktp.id)}>
            {editingId === ktp.id ? (
              <TextField
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <ListItemText primary={ktp.name} />
            )}
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
};

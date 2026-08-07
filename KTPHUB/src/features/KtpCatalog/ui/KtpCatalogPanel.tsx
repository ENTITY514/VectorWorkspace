import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { getKtpRepository } from "../../../shared/infrastructure/repositories";
import { AppDispatch } from "../../../store/store";
import { loadKtpsFromLocalStorage } from "../../../entities/ktp/model/slice";
import { useKtpCatalog } from "../model/useKtpCatalog";

export const KtpCatalogPanel: React.FC = () => {
  const { items, loading, error, reload } = useKtpCatalog();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const openKtp = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const detail = await getKtpRepository().getDetail(id);
      const localRaw = localStorage.getItem("ktps");
      const localList = localRaw ? JSON.parse(localRaw) : [];
      const existingIndex = localList.findIndex((k: { id: string }) => k.id === detail.id);
      const localItem = {
        id: detail.id,
        name: detail.title,
        className: detail.className,
        plan: detail.plan,
        totalHours: detail.totalHours,
        quarterWorkHours: detail.quarterWorkHours,
      };
      if (existingIndex >= 0) localList[existingIndex] = localItem;
      else localList.push(localItem);
      localStorage.setItem("ktps", JSON.stringify(localList));
      dispatch(loadKtpsFromLocalStorage());
      navigate(`/ktp-editor/${detail.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось открыть КТП");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Каталог опубликованных КТП
      </Typography>
      <Button variant="outlined" sx={{ mb: 2 }} onClick={reload}>
        Обновить
      </Button>
      {(error || actionError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || actionError}
        </Alert>
      )}
      {loading ? (
        <Typography>Загрузка…</Typography>
      ) : items.length === 0 ? (
        <Typography color="text.secondary">Пока нет опубликованных КТП</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Класс</TableCell>
              <TableCell>Предмет</TableCell>
              <TableCell>Опубликовано</TableCell>
              <TableCell align="right">Действие</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.className || item.grade || "—"}</TableCell>
                <TableCell>{item.subject || "—"}</TableCell>
                <TableCell>
                  {item.publishedAt
                    ? new Date(item.publishedAt).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busyId === item.id}
                    onClick={() => void openKtp(item.id)}
                  >
                    Открыть
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
};

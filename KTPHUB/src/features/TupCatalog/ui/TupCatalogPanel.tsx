import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { getTupCatalogRepository } from "../../../shared/infrastructure/repositories";
import { upsertTup } from "../../../entities/circulumPlan/model/slice";
import { AppDispatch } from "../../../store/store";
import { useTupCatalog } from "../model/useTupCatalog";
import { TupCatalogFilters } from "./TupCatalogFilters";

export const TupCatalogPanel: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { items, filters, setFilters, loading, error, filterOptions, reload } =
    useTupCatalog();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const createKtp = async (tupId: string) => {
    setActionError(null);
    setBusyId(tupId);
    try {
      const detail = await getTupCatalogRepository().getDetail(tupId);
      dispatch(
        upsertTup({
          id: detail.id,
          name: detail.title,
          planData: detail.planData,
        })
      );
      navigate(`/ktp-editor/${detail.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось создать КТП");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Каталог ТУП
      </Typography>
      <TupCatalogFilters
        filters={filters}
        subjects={filterOptions.subjects}
        grades={filterOptions.grades}
        years={filterOptions.years}
        onChange={setFilters}
        onRefresh={reload}
      />
      {(error || actionError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || actionError}
        </Alert>
      )}
      {loading ? (
        <Typography>Загрузка…</Typography>
      ) : items.length === 0 ? (
        <Typography color="text.secondary">Пока нет опубликованных ТУП</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Предмет</TableCell>
              <TableCell>Класс</TableCell>
              <TableCell>Год</TableCell>
              <TableCell>Программа</TableCell>
              <TableCell align="right">Действие</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.subject || "—"}</TableCell>
                <TableCell>{item.grade || "—"}</TableCell>
                <TableCell>{item.academicYear || "—"}</TableCell>
                <TableCell>{item.programKind.toUpperCase()}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" justifyContent="flex-end">
                    <Button
                      size="small"
                      variant="contained"
                      disabled={busyId === item.id}
                      onClick={() => void createKtp(item.id)}
                    >
                      Создать КТП
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
};

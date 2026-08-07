import React from "react";
import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useAdminTupUpload } from "../model/useAdminTupUpload";

export const AdminTupUploadForm: React.FC = () => {
  const {
    form,
    plan,
    error,
    success,
    loading,
    updateField,
    onFileSelected,
    submit,
  } = useAdminTupUpload();

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Button variant="outlined" component="label">
        Выбрать файл ТУП
        <input
          hidden
          type="file"
          accept=".docx,.xlsx,.xls"
          onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
        />
      </Button>

      {plan && (
        <Typography variant="body2" color="text.secondary">
          Распарсено четвертей: {plan.length}. Блоки будут сохранены в каталог.
        </Typography>
      )}

      <TextField
        label="Название"
        value={form.title}
        onChange={(e) => updateField("title", e.target.value)}
        required
        fullWidth
      />
      <TextField
        label="Предмет"
        value={form.subject}
        onChange={(e) => updateField("subject", e.target.value)}
        fullWidth
      />
      <TextField
        label="Класс"
        value={form.grade}
        onChange={(e) => updateField("grade", e.target.value)}
        placeholder="например 6"
        fullWidth
      />
      <TextField
        label="Учебный год"
        value={form.academicYear}
        onChange={(e) => updateField("academicYear", e.target.value)}
        placeholder="2025-2026"
        fullWidth
      />
      <TextField
        select
        label="Язык"
        value={form.language}
        onChange={(e) => updateField("language", e.target.value)}
        fullWidth
      >
        <MenuItem value="ru">Русский</MenuItem>
        <MenuItem value="kk">Қазақша</MenuItem>
        <MenuItem value="en">English</MenuItem>
      </TextField>
      <TextField
        select
        label="Тип программы"
        value={form.programKind}
        onChange={(e) =>
          updateField("programKind", e.target.value as "tup" | "tupr")
        }
        fullWidth
      >
        <MenuItem value="tup">ТУП</MenuItem>
        <MenuItem value="tupr">ТУПр</MenuItem>
      </TextField>
      <TextField
        select
        label="Статус"
        value={form.status}
        onChange={(e) =>
          updateField("status", e.target.value as "draft" | "published" | "archived")
        }
        fullWidth
      >
        <MenuItem value="draft">Черновик</MenuItem>
        <MenuItem value="published">Опубликован</MenuItem>
        <MenuItem value="archived">Архив</MenuItem>
      </TextField>

      <Button variant="contained" onClick={submit} disabled={loading || !plan}>
        {loading ? "Сохранение…" : "Сохранить в каталог"}
      </Button>
    </Stack>
  );
};

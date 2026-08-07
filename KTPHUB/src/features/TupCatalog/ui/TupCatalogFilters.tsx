import React from "react";
import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { TupListFilters } from "../../../shared/infrastructure/repositories";

interface TupCatalogFiltersProps {
  filters: TupListFilters;
  subjects: string[];
  grades: string[];
  years: string[];
  onChange: (next: TupListFilters) => void;
  onRefresh: () => void;
}

export const TupCatalogFilters: React.FC<TupCatalogFiltersProps> = ({
  filters,
  subjects,
  grades,
  years,
  onChange,
  onRefresh,
}) => {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
      <TextField
        select
        label="Предмет"
        value={filters.subject ?? ""}
        onChange={(e) =>
          onChange({ ...filters, subject: e.target.value || undefined })
        }
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="">Все</MenuItem>
        {subjects.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Класс"
        value={filters.grade ?? ""}
        onChange={(e) =>
          onChange({ ...filters, grade: e.target.value || undefined })
        }
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="">Все</MenuItem>
        {grades.map((g) => (
          <MenuItem key={g} value={g}>
            {g}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Год"
        value={filters.academicYear ?? ""}
        onChange={(e) =>
          onChange({ ...filters, academicYear: e.target.value || undefined })
        }
        sx={{ minWidth: 140 }}
      >
        <MenuItem value="">Все</MenuItem>
        {years.map((y) => (
          <MenuItem key={y} value={y}>
            {y}
          </MenuItem>
        ))}
      </TextField>
      <Button variant="outlined" onClick={onRefresh}>
        Обновить
      </Button>
    </Stack>
  );
};

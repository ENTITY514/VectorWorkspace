import React, { useState } from "react";
import { useAppDispatch, useAppSelector } from "../../shared/lib/hooks";
import {
  setActiveProfile,
  addProfile,
  removeActiveProfile,
  updateActiveProfileName,
  setQuarterDateForActiveProfile,
  addHoliday,
  removeHoliday,
  loadKzProductionCalendarForYears,
  addAdditionalHoliday,
  removeAdditionalHoliday,
} from "../../entities/calendar/model/slice";
import {
  CalendarProfile,
  QuarterDates,
} from "../../entities/calendar/model/types";
import {
  Box,
  TextField,
  Typography,
  Paper,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";

export const CalendarSettings: React.FC = () => {
  const dispatch = useAppDispatch();
  const { profiles, activeProfileId, holidays } = useAppSelector(
    (state) => state.calendar
  );
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });
  const [newAdditionalHoliday, setAdditionalHoliday] = useState({
    start: "",
    end: "",
    name: "",
  });
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleQuarterChange = (
    quarter: keyof CalendarProfile["quarters"],
    field: keyof QuarterDates,
    value: string
  ) => {
    if (!activeProfile) return;
    dispatch(
      setQuarterDateForActiveProfile({
        quarter,
        dates: { ...activeProfile.quarters[quarter], [field]: value },
      })
    );
  };

  const handleAddHoliday = () => {
    if (newHoliday.date && newHoliday.name) {
      dispatch(addHoliday(newHoliday));
      setNewHoliday({ date: "", name: "" });
    }
  };

  const handleAddAdditionalHoliday = () => {
    if (
      newAdditionalHoliday.start &&
      newAdditionalHoliday.end &&
      newAdditionalHoliday.name
    ) {
      dispatch(addAdditionalHoliday(newAdditionalHoliday));
      setAdditionalHoliday({ start: "", end: "", name: "" });
    }
  };

  const handleAddProfile = () => {
    const name = prompt("Введите название нового профиля:", "Новый профиль");
    if (name) dispatch(addProfile(name));
  };

  const handleRenameProfile = () => {
    if (!activeProfile) return;
    const name = prompt("Введите новое название профиля:", activeProfile.name);
    if (name && name !== activeProfile.name)
      dispatch(updateActiveProfileName(name));
  };

  const handleConfirmDeleteProfile = () => {
    dispatch(removeActiveProfile());
    setDeleteDialogOpen(false);
  };

  if (!activeProfile) {
    return (
      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6">Профили календаря не найдены</Typography>
        <Button onClick={handleAddProfile} variant="contained" sx={{ mt: 2 }}>
          Создать первый профиль
        </Button>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <FormControl sx={{ minWidth: 240 }}>
            <InputLabel id="profile-select-label">Активный профиль</InputLabel>
            <Select
              labelId="profile-select-label"
              value={activeProfile.id}
              label="Активный профиль"
              onChange={(e) => dispatch(setActiveProfile(e.target.value))}
            >
              {profiles.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            onClick={handleRenameProfile}
            startIcon={<EditIcon />}
            color="primary"
          >
            Переименовать
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            onClick={handleAddProfile}
            startIcon={<AddIcon />}
            variant="outlined"
          >
            Добавить профиль
          </Button>
          <Button
            onClick={() => setDeleteDialogOpen(true)}
            startIcon={<DeleteIcon />}
            color="error"
            disabled={profiles.length <= 1}
          >
            Удалить профиль
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <Box sx={{ flex: "1 1 450px", minWidth: "320px" }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Typography variant="h6" gutterBottom>
              Даты для профиля "{activeProfile.name}"
            </Typography>
            <Box component="form" noValidate>
              {Object.entries(activeProfile.quarters).map(([key, dates]) => (
                <Box
                  key={key}
                  sx={{
                    mb: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ width: "120px", flexShrink: 0 }}
                  >
                    {`Четверть ${key.substring(1)}:`}
                  </Typography>
                  <TextField
                    label="Начало"
                    type="date"
                    value={dates.start}
                    onChange={(e) =>
                      handleQuarterChange(key as any, "start", e.target.value)
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Конец"
                    type="date"
                    value={dates.end}
                    onChange={(e) =>
                      handleQuarterChange(key as any, "end", e.target.value)
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
              ))}
            </Box>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Дополнительные каникулы
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
              <TextField
                label="Начало"
                type="date"
                value={newAdditionalHoliday.start}
                onChange={(e) =>
                  setAdditionalHoliday({
                    ...newAdditionalHoliday,
                    start: e.target.value,
                  })
                }
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Конец"
                type="date"
                value={newAdditionalHoliday.end}
                onChange={(e) =>
                  setAdditionalHoliday({
                    ...newAdditionalHoliday,
                    end: e.target.value,
                  })
                }
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Название"
                value={newAdditionalHoliday.name}
                onChange={(e) =>
                  setAdditionalHoliday({
                    ...newAdditionalHoliday,
                    name: e.target.value,
                  })
                }
                sx={{ flexGrow: 1 }}
                size="small"
              />
              <Button
                variant="contained"
                onClick={handleAddAdditionalHoliday}
                startIcon={<AddIcon />}
                size="small"
              >
                Добавить
              </Button>
            </Box>
            <List dense>
              {activeProfile.additionalHolidays.map((h) => (
                <ListItem
                  key={h.id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() =>
                        dispatch(removeAdditionalHoliday({ id: h.id }))
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={h.name}
                    secondary={`${h.start} - ${h.end}`}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 450px", minWidth: "320px" }}>
          <Paper elevation={2} sx={{ p: 3, height: "100%" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Typography variant="h6">
                Праздничные дни и автопереносы РК
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                onClick={() => dispatch(loadKzProductionCalendarForYears([2025, 2026]))}
              >
                Обновить Календарь РК (2025–2026)
              </Button>
            </Box>

            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
              <TextField
                label="Дата"
                type="date"
                value={newHoliday.date}
                onChange={(e) =>
                  setNewHoliday({ ...newHoliday, date: e.target.value })
                }
                InputLabelProps={{ shrink: true }}
                sx={{ flex: "1 1 150px" }}
              />
              <TextField
                label="Название праздника"
                value={newHoliday.name}
                onChange={(e) =>
                  setNewHoliday({ ...newHoliday, name: e.target.value })
                }
                sx={{ flex: "2 1 200px" }}
              />
              <Button
                variant="contained"
                onClick={handleAddHoliday}
                startIcon={<AddIcon />}
              >
                Добавить
              </Button>
            </Box>
            <Divider sx={{ my: 2 }} />
            <List sx={{ maxHeight: 350, overflow: "auto" }}>
              {holidays.map((h) => (
                <ListItem
                  key={h.id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => dispatch(removeHoliday({ id: h.id }))}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={h.name}
                    secondary={`${new Date(h.date + 'T00:00:00').toLocaleDateString("ru-RU")}${h.isTransfer ? " (Автоперенос РК)" : ""}`}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>
      </Box>

      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить профиль "{activeProfile.name}"? Это
            действие нельзя будет отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleConfirmDeleteProfile} color="error">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

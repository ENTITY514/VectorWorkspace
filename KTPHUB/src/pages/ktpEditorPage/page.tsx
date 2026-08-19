import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Container,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Chip,
  Paper,
  TextField,
  Divider,
} from "@mui/material";
import { useAppSelector, useAppDispatch } from "../../shared/lib/hooks";
import {
  resetKtpEditor, // Импортируем reset
  createKtpFromTup,
  autofillDates,
  clearAutofillError,
  setTotalHours,
  setQuarterWorkHours,
  saveKtpToLocalStorage,
  setKtpForEditing,
  setClassName,
} from "../../entities/ktp/model/slice";
import { KtpEditor } from "../../features/KTPEditor";
import { DayOfWeek } from "../../entities/ktp/model/types";
import { validateKtpPlanInvariants } from "../../entities/ktp/model/invariants";
import NotificationModal from "../../components/NotificationModal/NotificationModal";
import { generateWordDocument } from "../../shared/lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../../shared/lib/xlsx-generator";
import { updateActiveTitlePage } from "../../entities/titlePage/model/slice";
import { updateActiveNote } from "../../entities/explanatoryNote/model/slice";
import { EditorPublishAction } from "../../features/PublishKtp";

const toYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const KtpEditorPage: React.FC = () => {
  const { ktpId } = useParams<{ ktpId: string }>();
  const dispatch = useAppDispatch();

  const { savedKtps, status, error, sourceTupName, plan, autofillError, totalHours, quarterWorkHours, className } =
    useAppSelector((state) => state.ktpEditor);
  const calendarState = useAppSelector((state) => state.calendar);
  const activeProfile = calendarState.profiles.find(
    (p) => p.id === calendarState.activeProfileId
  );
  const quarters = activeProfile ? Object.keys(activeProfile.quarters) : [];

  const [selectedProfile, setSelectedProfile] = useState(
    calendarState.activeProfileId || ""
  );
  const [startQuarter, setStartQuarter] = useState(quarters[0] || "");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);

  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<
    "info" | "success" | "error"
  >("info");
  const [localTotalHours, setLocalTotalHours] = useState(totalHours.toString());

  useEffect(() => {
    // Эта логика запускается только если у нас есть ID и редактор в "чистом" состоянии
    if (ktpId && status === 'idle') {
      const existingKtp = savedKtps.find((k) => k.id === ktpId);
      if (existingKtp) {
        dispatch(setKtpForEditing(ktpId));
      } else {
        dispatch(createKtpFromTup(ktpId));
      }
    }
  }, [dispatch, ktpId, savedKtps, status]);

  // Отдельный эффект для очистки состояния при смене ID или уходе со страницы
  useEffect(() => {
    return () => {
      dispatch(resetKtpEditor());
    };
  }, [dispatch, ktpId]);

  useEffect(() => {
    setLocalTotalHours(totalHours.toString());
  }, [totalHours]);

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setLocalTotalHours(value);
    }
  };

  const handleHoursBlur = () => {
    const finalHours =
      localTotalHours === "" ? 0 : parseInt(localTotalHours, 10);
    dispatch(setTotalHours(finalHours));
  };

  const handleQuarterHoursChange = (
    quarter: keyof typeof quarterWorkHours,
    value: string
  ) => {
    if (/^\d*$/.test(value)) {
      const hours = value === "" ? 0 : parseInt(value, 10);
      dispatch(setQuarterWorkHours({ quarter, hours }));
    }
  };

  const possibleLessons = useMemo(() => {
    if (!activeProfile || selectedDays.length === 0) return {};

    const dayMap: { [key: number]: DayOfWeek } = {
      0: "воскресенье",
      1: "понедельник",
      2: "вторник",
      3: "среда",
      4: "четверг",
      5: "пятница",
      6: "суббота",
    };

    const allHolidays = new Set([
      ...calendarState.holidays.map((h) => h.date),
      ...activeProfile.additionalHolidays.flatMap((h) => {
        const dates = [];
        const start = new Date(h.start + 'T00:00:00');
        const end = new Date(h.end + 'T00:00:00');
        let currentDate = new Date(start);
        while (currentDate <= end) {
          dates.push(toYYYYMMDD(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
      }),
    ]);

    const isHoliday = (date: Date) => {
      const dateString = toYYYYMMDD(date);
      return allHolidays.has(dateString);
    };

    const result: { [key: string]: number } = {};

    for (const [qKey, qDates] of Object.entries(activeProfile.quarters)) {
      let count = 0;
      const start = new Date(qDates.start + 'T00:00:00');
      const end = new Date(qDates.end + 'T00:00:00');
      const tempDate = new Date(start);

      while (tempDate <= end) {
        const dayOfWeek = dayMap[tempDate.getDay()];
        if (selectedDays.includes(dayOfWeek) && !isHoliday(tempDate)) {
          count++;
        }
        tempDate.setDate(tempDate.getDate() + 1);
      }
      result[qKey] = count;
    }
    return result;
  }, [activeProfile, selectedDays, calendarState.holidays]);

  useEffect(() => {
    if (autofillError) {
      setNotificationMessage(autofillError);
      setNotificationType("error");
      setNotificationOpen(true);
    }
  }, [autofillError]);

  const handleAutofill = () => {
    if (activeProfile && selectedDays.length > 0 && startQuarter) {
      dispatch(
        autofillDates({
          startQuarter: startQuarter as "q1" | "q2" | "q3" | "q4",
          selectedDays,
          calendarProfile: activeProfile,
          holidays: calendarState.holidays,
        })
      );
    }
  };

  const handleNotificationClose = () => {
    setNotificationOpen(false);
    dispatch(clearAutofillError());
  };

  const handleSave = () => {
    try {
      dispatch(saveKtpToLocalStorage({ name: sourceTupName, id: ktpId, className }));
      setNotificationMessage("КТП успешно сохранено!");
      setNotificationType("success");
      setNotificationOpen(true);
    } catch (error) {
      setNotificationMessage("Ошибка при сохранении КТП.");
      setNotificationType("error");
      setNotificationOpen(true);
    }
  };

  const handleDownloadWord = () => {
    generateWordDocument({
      subjectName: sourceTupName,
      className,
      hoursPerWeek: selectedDays.length,
      totalHours,
      plan,
      quarterWorkHours,
    });
  };

  const handleDownloadXlsx = () => {
    generateXlsx(plan, `${sourceTupName}_${className}`);
  };

  const handleDownloadKundelikXlsx = () => {
    generateKundelikXlsx(plan, `${sourceTupName}_${className}`);
  };

  const renderQuarterInputs = () => {
    const quarterHoursSum = Object.values(quarterWorkHours).reduce(
      (sum, h) => sum + (h || 0),
      0
    );

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Распределение часов по четвертям
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {Object.entries(quarterWorkHours).map(([key, hours]) => (
            <TextField
              key={key}
              label={`Четверть ${key.substring(1)}`}
              type="text"
              value={hours || ""}
              onChange={(e) =>
                handleQuarterHoursChange(
                  key as keyof typeof quarterWorkHours,
                  e.target.value
                )
              }
              inputProps={{ inputMode: "numeric" }}
              sx={{ minWidth: 120 }}
            />
          ))}
        </Box>
        {quarterHoursSum > totalHours && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Сумма часов по четвертям ({quarterHoursSum}) превышает общее
            количество часов в году ({totalHours}).
          </Alert>
        )}
      </Box>
    );
  };

  const renderPossibleLessonsInfo = () => {
    if (!activeProfile || selectedDays.length === 0) return null;

    const differences = Object.keys(possibleLessons).filter(
      (qKey) =>
        possibleLessons[qKey] !==
        (quarterWorkHours[qKey as keyof typeof quarterWorkHours] || 0)
    );

    if (differences.length === 0) {
      return (
        <Alert severity="success" sx={{ mt: 2 }}>
          Указанное количество часов совпадает с возможным количеством уроков.
        </Alert>
      );
    }

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Анализ часов
        </Typography>
        {differences.map((qKey) => {
          const possible = possibleLessons[qKey];
          const specified =
            quarterWorkHours[qKey as keyof typeof quarterWorkHours] || 0;
          const diff = possible - specified;

          return (
            <Alert key={qKey} severity={diff > 0 ? "info" : "warning"} sx={{ mt: 1 }}>
              В {qKey.replace("q", "")} четверти:{" "}
              {diff > 0
                ? `возможно провести на ${diff} урок(ов) больше (возможно: ${possible}, указано: ${specified})`
                : `указанное количество часов превышает возможное на ${-diff} (возможно: ${possible}, указано: ${specified})`}
            </Alert>
          );
        })}
      </Box>
    );
  };

  const renderInvariantBanner = () => {
    if (plan.length === 0) return null;

    const hoursPerWeek = selectedDays.length;
    const report = validateKtpPlanInvariants(plan, hoursPerWeek);

    if (report.valid && hoursPerWeek > 0) {
      return (
        <Alert severity="success" sx={{ mt: 2 }}>
          Инварианты КТП соблюдены: дистанция СОР → СОЧ и буфер недельной
          нагрузки после СОЧ во всех четвертях.
        </Alert>
      );
    }

    const violations: string[] = [];
    report.checks.forEach((c) => {
      if (!c.fr22.ok) violations.push(`Четверть ${c.quarterNumber}: ${c.fr22.message}`);
      if (!c.fr23.ok) violations.push(`Четверть ${c.quarterNumber}: ${c.fr23.message}`);
    });

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Проверка инвариантов оценивания (Фаза 4)
        </Typography>
        {hoursPerWeek === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            Выберите дни проведения уроков, чтобы проверить буфер недельной
            нагрузки после СОЧ (FR-2.3).
          </Alert>
        ) : null}
        {violations.map((v, i) => (
          <Alert key={i} severity="error" sx={{ mt: 1 }}>
            {v}
          </Alert>
        ))}
        {violations.length === 0 && hoursPerWeek > 0 ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Все четверти соответствуют инвариантам оценивания.
          </Alert>
        ) : null}
      </Box>
    );
  };

  let content;

  if (status === "loading") {
    content = <CircularProgress />;
  } else if (status === "succeeded") {
    content = <KtpEditor />;
  } else if (status === "failed") {
    content = <Alert severity="error">{error}</Alert>;
  }

  return (
    <Container maxWidth="xl">
      <Typography variant="h4" component="h1" gutterBottom>
        Редактор КТП: "{sourceTupName || "..."}"
      </Typography>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Настройки КТП
          </Typography>
          <TextField
            label="Класс"
            type="text"
            value={className}
            onChange={(e) => dispatch(setClassName(e.target.value))}
            sx={{ minWidth: 200, mr: 2 }}
          />
          <TextField
            label="Общее количество часов в году"
            type="text"
            value={localTotalHours}
            onChange={handleHoursChange}
            onBlur={handleHoursBlur}
            inputProps={{ inputMode: "numeric" }}
            sx={{ minWidth: 200 }}
          />
        </Box>
        {renderQuarterInputs()}
        <Divider sx={{ my: 2 }} />
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Настройки автоматического заполнения
        </Typography>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Профиль календаря</InputLabel>
            <Select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              label="Профиль календаря"
              disabled={calendarState.profiles.length === 0}
            >
              {calendarState.profiles.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Начать с четверти</InputLabel>
            <Select
              value={startQuarter}
              onChange={(e) => setStartQuarter(e.target.value as string)}
              label="Начать с четверти"
              disabled={quarters.length === 0}
            >
              {quarters.map((q, index) => (
                <MenuItem key={q} value={q}>
                  Четверть {index + 1}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel>Дни проведения уроков</InputLabel>
            <Select
              multiple
              value={selectedDays}
              onChange={(e) => setSelectedDays(e.target.value as DayOfWeek[])}
              input={<OutlinedInput label="Дни проведения уроков" />}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} />
                  ))}
                </Box>
              )}
            >
              {[
                "понедельник",
                "вторник",
                "среда",
                "четверг",
                "пятница",
                "суббота",
                "воскресенье",
              ].map((day) => (
                <MenuItem key={day} value={day}>
                  {day}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleAutofill}
            disabled={
              !selectedProfile || selectedDays.length === 0 || !startQuarter
            }
          >
            Автозаполнение дат
          </Button>
        </Box>
        {renderPossibleLessonsInfo()}
        {renderInvariantBanner()}
      </Paper>

      {content}

      <Box sx={{ mt: 4, display: "flex", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Button
          variant="outlined"
          color="info"
          size="large"
          onClick={() => {
            dispatch(
              updateActiveTitlePage({
                subjectRu: sourceTupName || "математика",
                subjectKz: sourceTupName || "математика",
                grade: className || "",
                titleRu: `Календарно-тематическое планирование по предмету "${sourceTupName || "математика"}" на 2024-2025 учебный год`,
              })
            );
            window.location.hash = "";
            window.location.pathname = "/title-page";
          }}
        >
          Создать Титульный Лист
        </Button>
        <Button
          variant="outlined"
          color="info"
          size="large"
          onClick={() => {
            dispatch(
              updateActiveNote({
                subjectsAndGrades: `по предмету «${sourceTupName || "математика"}» в ${className || ""} классе`,
              })
            );
            window.location.pathname = "/explanatory-note";
          }}
        >
          Создать Пояснительную Записку
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={handleSave}
        >
          Сохранить КТП
        </Button>
        <EditorPublishAction
          ktpId={ktpId}
          name={sourceTupName}
          className={className}
          plan={plan}
          totalHours={totalHours}
          quarterWorkHours={quarterWorkHours}
          sourceTupId={ktpId}
        />
        <Button
          variant="outlined"
          size="large"
          onClick={handleDownloadWord}
        >
          Скачать Word файл
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={handleDownloadXlsx}
        >
          Скачать XLSX файл
        </Button>
        <Button
          variant="outlined"
          color="success"
          size="large"
          onClick={handleDownloadKundelikXlsx}
        >
          Скачать для Kundelik.kz (.xlsx)
        </Button>
      </Box>

      <NotificationModal
        open={notificationOpen}
        onClose={handleNotificationClose}
        message={notificationMessage}
        type={notificationType}
      />
    </Container>
  );
};

export default KtpEditorPage;

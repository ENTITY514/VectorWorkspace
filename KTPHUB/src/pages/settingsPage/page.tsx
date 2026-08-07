import React, { useState } from "react";
import { Container, Typography, Paper, Box, Button, Alert } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { CalendarSettings } from "../../features/CalendarSettings";

const SettingsPage: React.FC = () => {
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleExportBackup = () => {
    try {
      const backupData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        ktps: JSON.parse(localStorage.getItem("ktps") || "[]"),
        academicPlanData: JSON.parse(localStorage.getItem("academicPlanData") || "[]"),
        calendarSettings: JSON.parse(localStorage.getItem("calendarSettings") || "{}"),
        titlePagesCustom: JSON.parse(localStorage.getItem("titlePages_custom") || "[]"),
        explanatoryNotesCustom: JSON.parse(localStorage.getItem("explanatoryNotes_custom") || "[]"),
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `ktp-hub-backup-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setNotification({ message: "Резервная копия данных успешно скачана!", type: "success" });
    } catch (e) {
      setNotification({ message: "Ошибка при экспорте резервной копии.", type: "error" });
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.ktps) localStorage.setItem("ktps", JSON.stringify(parsed.ktps));
        if (parsed.academicPlanData) localStorage.setItem("academicPlanData", JSON.stringify(parsed.academicPlanData));
        if (parsed.calendarSettings) localStorage.setItem("calendarSettings", JSON.stringify(parsed.calendarSettings));
        if (parsed.titlePagesCustom) localStorage.setItem("titlePages_custom", JSON.stringify(parsed.titlePagesCustom));
        if (parsed.explanatoryNotesCustom) localStorage.setItem("explanatoryNotes_custom", JSON.stringify(parsed.explanatoryNotesCustom));

        setNotification({ message: "Данные успешно восстановлены! Перезагрузка страницы...", type: "success" });
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        setNotification({ message: "Ошибка чтения JSON-файла резервной копии.", type: "error" });
      }
    };
    reader.readAsText(file);
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Настройки КТП Hub
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Здесь вы можете настроить даты учебных четвертей, праздничные дни и управлять резервными копиями данных.
      </Typography>

      {notification && (
        <Alert severity={notification.type} sx={{ mb: 3 }} onClose={() => setNotification(null)}>
          {notification.message}
        </Alert>
      )}

      <CalendarSettings />

      <Paper elevation={2} sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Резервное копирование и восстановление
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Экспортируйте все ваши сохраненные ТУП, КТП и настройки календаря в один файл для переноса на другой ПК или резервного хранения.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={handleExportBackup}
          >
            Скачать резервную копию (JSON)
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            component="label"
            startIcon={<UploadFileIcon />}
          >
            Восстановить из файла
            <input type="file" accept=".json" hidden onChange={handleImportBackup} />
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default SettingsPage;


// src/components/NotificationModal/NotificationModal.tsx
import React from "react";
import {
  Snackbar,
  Alert,
  AlertTitle,
  Box,
  IconButton,
  AlertColor,
  styled,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

const alertColors: Record<string, AlertColor> = {
  info: "info",
  success: "success",
  error: "error",
};

const alertTitles: Record<string, string> = {
  info: "Информация",
  success: "Успех",
  error: "Ошибка",
};

interface NotificationModalProps {
  open: boolean;
  onClose: () => void;
  message: string;
  type: "info" | "success" | "error";
  title?: string;
}

const StyledSnackbar = styled(Snackbar)({
  bottom: 16,
  right: 16,
  left: "auto",
});

const NotificationModal: React.FC<NotificationModalProps> = ({
  open,
  onClose,
  message,
  type,
  title,
}) => {
  const alertType = alertColors[type] || "info";
  const alertTitle = title || alertTitles[type] || "Оповещение";

  return (
    <StyledSnackbar
      open={open}
      autoHideDuration={6000}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert
        onClose={onClose}
        severity={alertType}
        variant="filled"
        sx={{ width: "100%" }}
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={onClose}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
      >
        <AlertTitle sx={{ fontWeight: "bold" }}>{alertTitle}</AlertTitle>
        <Box sx={{ mt: 1 }}>{message}</Box>
      </Alert>
    </StyledSnackbar>
  );
};

export default NotificationModal;

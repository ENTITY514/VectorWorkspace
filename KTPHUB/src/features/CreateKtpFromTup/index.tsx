// src/features/CreateKtpFromTup/index.tsx

import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Box } from "@mui/material";

interface CreateKtpFromTupProps {
  tupId: string;
}

export const CreateKtpFromTup: React.FC<CreateKtpFromTupProps> = ({
  tupId,
}) => {
  const navigate = useNavigate();

  return (
    <Box sx={{ mt: 4, display: "flex", justifyContent: "center" }}>
      <Button
        variant="contained"
        color="primary"
        size="large"
        onClick={() => navigate(`/ktp-editor/${tupId}`)}
      >
        Создать КТП из этого ТУП
      </Button>
    </Box>
  );
};

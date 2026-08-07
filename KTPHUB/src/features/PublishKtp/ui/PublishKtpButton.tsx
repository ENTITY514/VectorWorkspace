import React from "react";
import { Alert, Button } from "@mui/material";
import { SavedKtp } from "../../../entities/ktp/model/slice";
import { usePublishKtp } from "../model/usePublishKtp";

interface PublishKtpButtonProps {
  ktp: SavedKtp;
  sourceTupId?: string | null;
}

export const PublishKtpButton: React.FC<PublishKtpButtonProps> = ({
  ktp,
  sourceTupId,
}) => {
  const { publish, loading, error, success } = usePublishKtp();

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 1 }}>
          {success}
        </Alert>
      )}
      <Button
        variant="outlined"
        color="secondary"
        disabled={loading}
        onClick={() => void publish(ktp, { sourceTupId })}
      >
        {loading ? "Публикация…" : "Опубликовать КТП"}
      </Button>
    </>
  );
};

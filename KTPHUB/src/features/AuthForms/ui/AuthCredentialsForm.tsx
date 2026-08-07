import React, { useState } from "react";
import { Alert, Box, Button, Stack, TextField } from "@mui/material";

export interface AuthCredentialsFormProps {
  submitLabel: string;
  showDisplayName?: boolean;
  onSubmit: (values: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
}

export const AuthCredentialsForm: React.FC<AuthCredentialsFormProps> = ({
  submitLabel,
  showDisplayName = false,
  onSubmit,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {showDisplayName && (
          <TextField
            label="Имя"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            fullWidth
          />
        )}
        <TextField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          autoComplete="email"
        />
        <TextField
          label="Пароль"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          autoComplete={showDisplayName ? "new-password" : "current-password"}
        />
        <Button type="submit" variant="contained" disabled={loading}>
          {loading ? "…" : submitLabel}
        </Button>
      </Stack>
    </Box>
  );
};

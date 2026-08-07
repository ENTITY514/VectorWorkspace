import React from "react";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import { Link, Typography } from "@mui/material";
import { useAuth } from "../../../entities/session";
import { AuthCredentialsForm } from "./AuthCredentialsForm";

export const LoginForm: React.FC = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";

  return (
    <>
      <AuthCredentialsForm
        submitLabel="Войти"
        onSubmit={async ({ email, password }) => {
          await signIn(email, password);
          navigate(from, { replace: true });
        }}
      />
      <Typography variant="body2" sx={{ mt: 2 }}>
        Нет аккаунта?{" "}
        <Link component={RouterLink} to="/register">
          Регистрация
        </Link>
      </Typography>
    </>
  );
};

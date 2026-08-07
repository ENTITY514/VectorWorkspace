import React from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Link, Typography } from "@mui/material";
import { useAuth } from "../../../entities/session";
import { AuthCredentialsForm } from "./AuthCredentialsForm";

export const RegisterForm: React.FC = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <AuthCredentialsForm
        submitLabel="Зарегистрироваться"
        showDisplayName
        onSubmit={async ({ email, password, displayName }) => {
          await signUp(email, password, displayName);
          navigate("/", { replace: true });
        }}
      />
      <Typography variant="body2" sx={{ mt: 2 }}>
        Уже есть аккаунт?{" "}
        <Link component={RouterLink} to="/login">
          Войти
        </Link>
      </Typography>
    </>
  );
};

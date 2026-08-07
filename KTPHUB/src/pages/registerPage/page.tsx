import React from "react";
import { Container, Paper, Typography } from "@mui/material";
import { RegisterForm } from "../../features/AuthForms";

const RegisterPage: React.FC = () => {
  return (
    <Container maxWidth="sm">
      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Регистрация
        </Typography>
        <RegisterForm />
      </Paper>
    </Container>
  );
};

export default RegisterPage;

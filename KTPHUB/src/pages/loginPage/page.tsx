import React from "react";
import { Container, Paper, Typography } from "@mui/material";
import { LoginForm } from "../../features/AuthForms";

const LoginPage: React.FC = () => {
  return (
    <Container maxWidth="sm">
      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Вход
        </Typography>
        <LoginForm />
      </Paper>
    </Container>
  );
};

export default LoginPage;

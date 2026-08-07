import React from "react";
import { Container, Paper, Typography } from "@mui/material";
import { AdminTupUploadForm } from "../../features/AdminTupUpload";

const AdminTupPage: React.FC = () => {
  return (
    <Container maxWidth="md">
      <Typography variant="h4" gutterBottom>
        Админ: загрузка ТУП
      </Typography>
      <Paper sx={{ p: 3 }}>
        <AdminTupUploadForm />
      </Paper>
    </Container>
  );
};

export default AdminTupPage;

import React from "react";
import { Container, Typography } from "@mui/material";
import { KtpCatalogPanel } from "../../features/KtpCatalog";

const KtpCatalogPage: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        Каталог КТП
      </Typography>
      <KtpCatalogPanel />
    </Container>
  );
};

export default KtpCatalogPage;

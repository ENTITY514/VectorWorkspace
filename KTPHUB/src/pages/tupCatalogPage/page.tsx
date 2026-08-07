import React from "react";
import { Container, Typography } from "@mui/material";
import { TupCatalogPanel } from "../../features/TupCatalog";

const TupCatalogPage: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        Каталог ТУП
      </Typography>
      <TupCatalogPanel />
    </Container>
  );
};

export default TupCatalogPage;

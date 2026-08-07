// src/pages/TupViewPage/index.tsx

import React from "react";
import { useParams } from "react-router-dom";
import { Container, Typography, CircularProgress, Alert } from "@mui/material";
import { useAppSelector } from "../../shared/lib/hooks";
import { CreateKtpFromTup } from "../../features/CreateKtpFromTup";
import { selectTupById } from "../../entities/circulumPlan/model/selectors";
import HierarchicalPlanView from "../../entities/circulumPlan/ui/hierarchPlanView";

const TupViewPage: React.FC = () => {
  const { tupId } = useParams<{ tupId: string }>();

  const tupData = useAppSelector((state) =>
    tupId ? selectTupById(state, tupId) : undefined
  );
  const isTupListEmpty = useAppSelector(
    (state) => state.academicPlan.tupList.length === 0
  );

  console.log("TupViewPage tupId:", tupId);
  console.log("TupViewPage tupData:", tupData);

  if (!tupId) {
    return <Alert severity="error">Некорректный ID для ТУП.</Alert>;
  }

  if (!tupData) {
    if (isTupListEmpty) {
      return <CircularProgress />;
    }
    return <Alert severity="error">ТУП с таким ID не найден.</Alert>;
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Просмотр ТУП: "{tupData.name}"
      </Typography>

      <HierarchicalPlanView data={tupData.planData} />

      <CreateKtpFromTup tupId={tupId!} />
    </Container>
  );
};

export default TupViewPage;

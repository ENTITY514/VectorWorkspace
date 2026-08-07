// src/widgets/KtpTable/index.tsx

import React from "react";
import {
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  Paper,
} from "@mui/material";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KtpPlan } from "../../entities/ktp/model/types";
import { KtpTableRow } from "../../entities/ktp/ui/KTPTableRow";

interface KtpTableProps {
  plan: KtpPlan;
}

export const KtpTable: React.FC<KtpTableProps> = ({ plan }) => {
  return (
    <TableContainer component={Paper}>
      <SortableContext
        items={plan.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}></TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>№</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Часы</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Раздел</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Тема урока</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Цели обучения</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Кол-во часов</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Дата</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Примечание</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plan.map((lesson, index) => (
              <KtpTableRow
                key={lesson.id}
                lesson={lesson}
                prevLesson={plan[index - 1]}
                plan={plan}
              />
            ))}
          </TableBody>
        </Table>
      </SortableContext>
    </TableContainer>
  );
};

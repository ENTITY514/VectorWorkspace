// src/widgets/ExplanatoryNoteWidget/ui/ExplanatoryNotePreview.tsx

import React from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import { ExplanatoryNoteData } from "../../../entities/explanatoryNote/model/types";

interface ExplanatoryNotePreviewProps {
  data: ExplanatoryNoteData;
}

export const ExplanatoryNotePreview: React.FC<ExplanatoryNotePreviewProps> = ({ data }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        maxWidth: "800px",
        minHeight: "1000px",
        margin: "0 auto",
        p: { xs: 3, sm: 5 },
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "'Times New Roman', Times, serif",
        boxSizing: "border-box",
        boxShadow: "0px 4px 20px rgba(0,0,0,0.15)",
      }}
    >
      {/* Title */}
      <Typography
        variant="h6"
        align="center"
        fontWeight="bold"
        sx={{ fontFamily: "inherit", fontSize: "1.3rem", mb: 3 }}
      >
        {data.title}
      </Typography>

      {/* Main intro paragraph */}
      <Typography
        paragraph
        align="justify"
        sx={{ fontFamily: "inherit", textIndent: "2em", lineHeight: 1.5, fontSize: "1rem" }}
      >
        Календарно-тематическое планирование {data.subjectsAndGrades} составлено в соответствии с {data.gosoOrder} и с учетом {data.impLetter}
      </Typography>

      {/* Additional paragraphs */}
      {data.introParagraphs.map((para, idx) => (
        <Typography
          key={idx}
          paragraph
          align="justify"
          sx={{ fontFamily: "inherit", textIndent: "2em", lineHeight: 1.5, fontSize: "1rem" }}
        >
          {para}
        </Typography>
      ))}

      {/* Textbooks List */}
      {data.textbooks && data.textbooks.length > 0 && (
        <Box sx={{ mt: 3, mb: 3 }}>
          <Typography fontWeight="bold" sx={{ fontFamily: "inherit", mb: 1, fontSize: "1rem" }}>
            Используемые для обучения учебники:
          </Typography>
          {data.textbooks.map((tb, idx) => (
            <Typography key={idx} sx={{ fontFamily: "inherit", pl: 2, mb: 0.5, fontSize: "0.95rem" }}>
              • {tb}
            </Typography>
          ))}
        </Box>
      )}

      {/* SOR Tables */}
      {data.sorTables && data.sorTables.length > 0 && (
        <Box sx={{ mt: 4 }}>
          {data.sorTables.map((st, tableIdx) => (
            <Box key={tableIdx} sx={{ mb: 3 }}>
              <Typography fontWeight="bold" sx={{ fontFamily: "inherit", mb: 1, fontSize: "1rem" }}>
                Количество процедур суммативного оценивания за раздел/сквозную тему по предмету «{st.subject}»
              </Typography>
              <Table size="small" sx={{ border: "1px solid #000" }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                    <TableCell sx={{ border: "1px solid #000", fontWeight: "bold", fontFamily: "inherit" }}>
                      Класс
                    </TableCell>
                    <TableCell align="center" sx={{ border: "1px solid #000", fontWeight: "bold", fontFamily: "inherit" }}>
                      1 четверть
                    </TableCell>
                    <TableCell align="center" sx={{ border: "1px solid #000", fontWeight: "bold", fontFamily: "inherit" }}>
                      2 четверть
                    </TableCell>
                    <TableCell align="center" sx={{ border: "1px solid #000", fontWeight: "bold", fontFamily: "inherit" }}>
                      3 четверть
                    </TableCell>
                    <TableCell align="center" sx={{ border: "1px solid #000", fontWeight: "bold", fontFamily: "inherit" }}>
                      4 четверть
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {st.grades.map((g, gradeIdx) => (
                    <TableRow key={gradeIdx}>
                      <TableCell sx={{ border: "1px solid #000", fontFamily: "inherit" }}>
                        {g.grade}
                      </TableCell>
                      <TableCell align="center" sx={{ border: "1px solid #000", fontFamily: "inherit" }}>
                        {g.q1}
                      </TableCell>
                      <TableCell align="center" sx={{ border: "1px solid #000", fontFamily: "inherit" }}>
                        {g.q2}
                      </TableCell>
                      <TableCell align="center" sx={{ border: "1px solid #000", fontFamily: "inherit" }}>
                        {g.q3}
                      </TableCell>
                      <TableCell align="center" sx={{ border: "1px solid #000", fontFamily: "inherit" }}>
                        {g.q4}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
};

// src/features/ExplanatoryNoteEditor/ui/SorTableEditor.tsx

import React from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  IconButton,
  Button,
  Paper,
  Stack,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useAppDispatch, useAppSelector } from "../../../shared/lib/hooks";
import { updateActiveNote } from "../../../entities/explanatoryNote/model/slice";
import { SorSubjectTable } from "../../../entities/explanatoryNote/model/types";

export const SorTableEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const sorTables = useAppSelector(
    (state) => state.explanatoryNote.activeNote.sorTables || []
  );

  const handleCellChange = (
    tableIndex: number,
    gradeIndex: number,
    quarterField: "q1" | "q2" | "q3" | "q4",
    val: number
  ) => {
    const updatedTables = JSON.parse(JSON.stringify(sorTables));
    updatedTables[tableIndex].grades[gradeIndex][quarterField] = val;
    dispatch(updateActiveNote({ sorTables: updatedTables }));
  };

  const handleGradeNameChange = (tableIndex: number, gradeIndex: number, name: string) => {
    const updatedTables = JSON.parse(JSON.stringify(sorTables));
    updatedTables[tableIndex].grades[gradeIndex].grade = name;
    dispatch(updateActiveNote({ sorTables: updatedTables }));
  };

  const handleSubjectNameChange = (tableIndex: number, name: string) => {
    const updatedTables = JSON.parse(JSON.stringify(sorTables));
    updatedTables[tableIndex].subject = name;
    dispatch(updateActiveNote({ sorTables: updatedTables }));
  };

  const handleAddGradeRow = (tableIndex: number) => {
    const updatedTables = JSON.parse(JSON.stringify(sorTables));
    updatedTables[tableIndex].grades.push({ grade: "Новый класс", q1: 1, q2: 1, q3: 1, q4: 1 });
    dispatch(updateActiveNote({ sorTables: updatedTables }));
  };

  const handleRemoveGradeRow = (tableIndex: number, gradeIndex: number) => {
    const updatedTables = JSON.parse(JSON.stringify(sorTables));
    updatedTables[tableIndex].grades.splice(gradeIndex, 1);
    dispatch(updateActiveNote({ sorTables: updatedTables }));
  };

  const handleAddSubjectTable = () => {
    const newSubject: SorSubjectTable = {
      subject: "Новый предмет",
      grades: [{ grade: "10 класс", q1: 2, q2: 2, q3: 2, q4: 2 }],
    };
    dispatch(updateActiveNote({ sorTables: [...sorTables, newSubject] }));
  };

  const handleRemoveSubjectTable = (tableIndex: number) => {
    const updatedTables = sorTables.filter((_, i) => i !== tableIndex);
    dispatch(updateActiveNote({ sorTables: updatedTables }));
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: "bold" }}>
          3. Таблица процедур СОР по четвертям
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddSubjectTable}
        >
          Добавить предмет
        </Button>
      </Stack>

      {sorTables.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", mb: 2 }}>
          Таблицы СОР не используются в данном типе пояснительной записки (например, для классов ЛУО).
        </Typography>
      ) : (
        <Stack spacing={3}>
          {sorTables.map((st, tableIdx) => (
            <Paper key={tableIdx} variant="outlined" sx={{ p: 2, backgroundColor: "#fafafa" }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <TextField
                  size="small"
                  label="Название предмета"
                  value={st.subject}
                  onChange={(e) => handleSubjectNameChange(tableIdx, e.target.value)}
                  sx={{ width: 250 }}
                />
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddGradeRow(tableIdx)}
                >
                  Добавить класс
                </Button>
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleRemoveSubjectTable(tableIdx)}
                  sx={{ ml: "auto" }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: "bold" }}>Класс</TableCell>
                    <TableCell align="center" sx={{ fontWeight: "bold" }}>1 четверть</TableCell>
                    <TableCell align="center" sx={{ fontWeight: "bold" }}>2 четверть</TableCell>
                    <TableCell align="center" sx={{ fontWeight: "bold" }}>3 четверть</TableCell>
                    <TableCell align="center" sx={{ fontWeight: "bold" }}>4 четверть</TableCell>
                    <TableCell align="center" sx={{ width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {st.grades.map((g, gradeIdx) => (
                    <TableRow key={gradeIdx}>
                      <TableCell>
                        <TextField
                          size="small"
                          variant="standard"
                          value={g.grade}
                          onChange={(e) =>
                            handleGradeNameChange(tableIdx, gradeIdx, e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          inputProps={{ style: { textAlign: "center" } }}
                          value={g.q1}
                          onChange={(e) =>
                            handleCellChange(tableIdx, gradeIdx, "q1", parseInt(e.target.value) || 0)
                          }
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          inputProps={{ style: { textAlign: "center" } }}
                          value={g.q2}
                          onChange={(e) =>
                            handleCellChange(tableIdx, gradeIdx, "q2", parseInt(e.target.value) || 0)
                          }
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          inputProps={{ style: { textAlign: "center" } }}
                          value={g.q3}
                          onChange={(e) =>
                            handleCellChange(tableIdx, gradeIdx, "q3", parseInt(e.target.value) || 0)
                          }
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          inputProps={{ style: { textAlign: "center" } }}
                          value={g.q4}
                          onChange={(e) =>
                            handleCellChange(tableIdx, gradeIdx, "q4", parseInt(e.target.value) || 0)
                          }
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() => handleRemoveGradeRow(tableIdx, gradeIdx)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
};

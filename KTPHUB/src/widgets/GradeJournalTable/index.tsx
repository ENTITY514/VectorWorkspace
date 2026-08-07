import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Alert, Box, Chip } from '@mui/material';
import { GradeJournalData } from '../../entities/gradeJournal/model/types';

interface GradeJournalTableProps {
  data: GradeJournalData | null;
}

const getGradeColor = (score: number | string | null, maxScore: number = 10): string => {
  if (score === null || score === '' || typeof score !== 'number') {
    return 'transparent';
  }
  const percentage = (score / maxScore) * 100;
  if (percentage < 50) return '#ffcdd2'; // Red
  if (percentage < 70) return '#ffe0b2'; // Orange
  return '#c8e6c9'; // Green
};

const GradeJournalTable: React.FC<GradeJournalTableProps> = ({ data }) => {
  const headers = useMemo(() => {
    if (!data?.headerRows || data.headerRows.length < 3) return [];
    
    const monthRow = data.headerRows[0] || [];
    const dayRow = data.headerRows[1] || [];
    const typeRow = data.headerRows[2] || [];
    const parsedHeaders: { display: string | number; type: string; maxScore: number }[] = [];

    for (let i = 3; i < dayRow.length; i++) {
        const dayVal = dayRow[i];
        const monthVal = monthRow[i];
        const typeVal = typeRow[i];

        if (typeof dayVal === 'number') {
            parsedHeaders.push({ display: dayVal, type: 'ФО', maxScore: 10 });
        } else if (dayVal === 'Макс.балл') {
            parsedHeaders.push({ display: monthVal, type: monthVal, maxScore: typeVal || 0 });
        }
    }
    return parsedHeaders;
  }, [data]);

  const monthColspans = useMemo(() => {
    if (!data?.headerRows || data.headerRows.length < 1) return [];

    const monthRow = data.headerRows[0] || [];
    const spans: { month: string; colspan: number }[] = [];
    let currentSpan = { month: '', colspan: 0 };

    for (let i = 3; i < monthRow.length; i++) {
        const cell = monthRow[i];
        if (cell && typeof cell === 'string' && !['СОр', 'СОч', '4 чтв'].includes(cell)) {
            if (currentSpan.month) spans.push(currentSpan);
            currentSpan = { month: cell, colspan: 1 };
        } else if (currentSpan.month && !cell) {
            currentSpan.colspan++;
        }
    }
    if (currentSpan.month) spans.push(currentSpan);
    return spans;
  }, [data]);

  const analysis = useMemo(() => {
    if (!data?.studentRows) return null;

    const excellent: string[] = [];
    const good: string[] = [];
    const satisfactory: string[] = [];
    let totalStudents = 0;

    let totalFoCells = 0;
    let filledFoCells = 0;
    const foColumns = headers.map((h, i) => h.type === 'ФО' ? i + 3 : -1).filter(i => i !== -1);

    data.studentRows.forEach(row => {
      const name = row[1];
      const finalGrade = row[row.length - 1];
      if (typeof name !== 'string' || name === '' || typeof finalGrade !== 'number') return;

      totalStudents++;
      if (finalGrade === 5) excellent.push(name);
      else if (finalGrade === 4) good.push(name);
      else if (finalGrade === 3) satisfactory.push(name);

      foColumns.forEach(colIndex => {
        totalFoCells++;
        const grade = row[colIndex];
        if (grade !== null && grade !== '') {
          filledFoCells++;
        }
      });
    });

    return {
      excellent, good, satisfactory,
      excellentPercent: totalStudents > 0 ? ((excellent.length / totalStudents) * 100).toFixed(1) : 0,
      goodPercent: totalStudents > 0 ? ((good.length / totalStudents) * 100).toFixed(1) : 0,
      satisfactoryPercent: totalStudents > 0 ? ((satisfactory.length / totalStudents) * 100).toFixed(1) : 0,
      fillPercent: totalFoCells > 0 ? ((filledFoCells / totalFoCells) * 100).toFixed(1) : 0,
    };
  }, [data, headers]);

  if (!data || !data.headerRows || data.headerRows.length < 3 || !data.studentRows) {
    return <Alert severity="error" sx={{ mt: 4 }}>Ошибка: Не удалось отобразить данные журнала. Структура файла некорректна или повреждена.</Alert>;
  }

  const { metaInfo, headerRows, studentRows } = data;

  return (
    <Paper sx={{ mt: 4, p: 2 }}>
      <Typography variant="h6">{metaInfo.classInfo}</Typography>
      <Typography variant="subtitle1">{metaInfo.subject}</Typography>
      <Typography variant="subtitle1" sx={{ pb: 2 }}>{metaInfo.teacherName}</Typography>
      <TableContainer sx={{ maxHeight: 700 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell rowSpan={3} sx={{ border: 1, zIndex: 10, position: 'sticky', left: 0, background: 'white' }}>№ п/п</TableCell>
              <TableCell rowSpan={3} sx={{ border: 1, zIndex: 10, position: 'sticky', left: 50, background: 'white' }}>Фамилия и имя ученика</TableCell>
              <TableCell rowSpan={3} sx={{ border: 1 }}>ИИН</TableCell>
              {monthColspans.map(({ month, colspan }) => (
                <TableCell key={month} colSpan={colspan} align="center" sx={{ border: 1 }}>{month}</TableCell>
              ))}
              <TableCell colSpan={2} align="center" sx={{ border: 1 }}>Итоги за четверть</TableCell>
              <TableCell rowSpan={3} align="center" sx={{ border: 1 }}>{headerRows[0][headerRows[0].length - 1]}</TableCell>
            </TableRow>
            <TableRow>
              {headers.slice(0, -2).map((h, index) => (
                <TableCell key={index} align="center" sx={{ border: 1 }}>{h.display}</TableCell>
              ))}
              <TableCell align="center" sx={{ border: 1 }}>{headers[headers.length-2]?.display}</TableCell>
              <TableCell align="center" sx={{ border: 1 }}>{headers[headers.length-1]?.display}</TableCell>
            </TableRow>
            <TableRow>
              {headers.slice(0, -2).map((h, index) => (
                <TableCell key={index} align="center" sx={{ border: 1 }}>{h.type}</TableCell>
              ))}
               <TableCell align="center" sx={{ border: 1 }}>Макс.балл</TableCell>
               <TableCell align="center" sx={{ border: 1 }}>Макс.балл</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {studentRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell: any, cellIndex: number) => {
                  let color = 'transparent';
                  if (cellIndex >= 3) {
                    const headerInfo = headers[cellIndex - 3];
                    if (headerInfo) {
                        color = getGradeColor(cell, headerInfo.maxScore);
                    }
                  }
                  return (
                    <TableCell 
                      key={cellIndex} 
                      align={cellIndex > 2 ? 'center' : 'left'} 
                      sx={{ 
                        border: 1, 
                        position: cellIndex < 2 ? 'sticky' : 'static', 
                        left: cellIndex === 0 ? 0 : 50, 
                        background: cellIndex < 2 ? 'white' : color,
                      }}
                    >
                      {cell}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {analysis && (
        <Box sx={{ mt: 3, p: 2 }}>
          <Typography variant="h6" gutterBottom>Анализ успеваемости</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ flex: '3 1 600px' }}>
              <Typography variant="subtitle1"><b>Отличники ({analysis.excellent.length} чел. - {analysis.excellentPercent}%):</b></Typography>
              <Typography variant="body2">{analysis.excellent.join(', ') || 'Нет'}</Typography>
              <Typography variant="subtitle1" sx={{ mt: 1 }}><b>Хорошисты ({analysis.good.length} чел. - {analysis.goodPercent}%):</b></Typography>
              <Typography variant="body2">{analysis.good.join(', ') || 'Нет'}</Typography>
              <Typography variant="subtitle1" sx={{ mt: 1 }}><b>Троечники ({analysis.satisfactory.length} чел. - {analysis.satisfactoryPercent}%):</b></Typography>
              <Typography variant="body2">{analysis.satisfactory.join(', ') || 'Нет'}</Typography>
            </Box>
            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle1"><b>Статистика журнала:</b></Typography>
              <Chip label={`Заполняемость: ${analysis.fillPercent}%`} color="primary" />
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default GradeJournalTable;

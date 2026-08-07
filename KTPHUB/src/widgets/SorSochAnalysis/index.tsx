
import React, { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Box,
  Grid,
} from '@mui/material';

// import { generateSorSochAnalysisDocx } from '../../shared/lib/word-generator';

// Mock data provided by the user
const initialAnalysisData = {
  "content": "Сведения об анализе по итогам проведения суммативного оценивания \n\nза 1 четверть по предмету математика\n\nКласс: 6 «А»\n\nКоличество учащихся: 14\n\nПедагог: Бабич И.Д.\n\nЦель: Проверить качество усвоения материала\n\n\n\nПредмет\n\nПисал\n\nМакс. балл\n\nПроцентное содержания суммативного оценивания\n\n% качества\n\n% успеваемости\n\nнизкий\n\nсредний\n\nвысокий\n\n0-39%\n\n40-84%\n\n85-100%\n\n\n\n\n\n\n\nКоличество учеников\n\n\n\n\n\nСОР№1\n\n14\n\n15\n\n0\n\n13\n\n1\n\n57\n\n100\n\nСОР№2\n\n14\n\n14\n\n0\n\n10\n\n4\n\n36\n\n100\n\nСОЧ\n\n14\n\n20\n\n0\n\n12\n\n2\n\n50\n\n100\n\n\n\nДостигнутые цели\n\nЦели, вызвавшие затруднения\n\nСОР№1\n\n6.5.2.1 читать и записывать отношения двух чисел\n\n6.1.2.6 делить величины в заданном отношении\n\n6.5.1.1 распознавать и решать задачи, в которых величины связаны прямой и обратной пропорциональностями\n\n6.3.3.4 знать и применять формулу площади круга\n\n6.5.1.3 применять масштаб при работе с картой, планом, чертежом\n\nСОР№2\n\n6.1.2.12 сравнивать рациональные числа\n\n6.1.1.9 знать определение модуля числа и находить его значение\n\n6.1.2.14 выполнять вычитание рациональных чисел\n\n6.3.3.1 находить расстояние между точками на координатной прямой\n\n6.1.2.11 изображать подмножества рациональных чисел с помощью кругов Эйлера-Венна\n\n6.1.2.9 изображать рациональные числа на координатной прямой\n\n6.1.2.13 выполнять сложение с одинаковыми знаками и с разными знаками рациональных чисел\n\nСОЧ\n\n6.1.2.5 знать и применять основное свойство пропорции\n\n6.1.1.6 усвоить понятие целого числа\n\n6.1.1.4 знать определение координатной прямой и строить  координатную прямую\n\n6.2.1.11  понимать геометрический  выражения |a −b |\n\n6.3.3.1 находить расстояние между точками на координатной прямой\n\n6.1.2.13  выполнять сложение с одинаковыми знаками и с разными знаками рациональных чисел\n\n6.5.1.2 решать задачи на проценты с помощью пропорции\n\n6.3.3.3 знать и применять формулу длины окружности\n\n6.3.3.4 знать и применять формулу площади круга\n\n6.1.1.5 усвоить понятие масштаба\n\n\n\n1. Анализ результатов СОР и СОЧ показал следующий уровень знаний у обучающихся:СОР №1:\n\nвысокий (В): 85-100%: Пазникова Д.\n\nсредний (С): 40-84%: Абельдинова Ж., Бердникова Д., Бердникова Е., Бучкова М., Васильковский Д., Галипад Д., Кисметьев И., Кох К., Кузнецов Р., Подольский А., Раменская В.,Ромазеева А., Романишина У..\n\nнизкий (Н): 0-39% нет\n\n\n\nСОР №2:\n\nвысокий (В): 85-100%: Пазникова Д., Бучкова М., Раменская В., Романишина У.\n\nсредний (С): 40-84%: Абельдинова Ж., Бердникова Д., Бердникова Е., Васильковский Д., Галипад Д., Кисметьев И., Кох К., Кузнецов Р., Подольский А.,Ромазеева А..\n\nнизкий (Н): 0-39% нет\n\n\n\nСОЧ; \n\nвысокий (В): 85-100%: Подольский А., Романишина У..\n\nсредний (С): 40-84%: %: Абельдинова Ж., Бердникова Д., Бердникова Е., Васильковский Д., Галипад Д., Кисметьев И., Кох К., Кузнецов Р., Ромазеева А..\n\nнизкий (Н): 0-39% нет\n\n\n\n2. Перечень затруднений, которые возникли у обучающихся при выполнении заданий:задание на нахождение масштаба, задача на процентное отношение, на нахождение длины окружности и ее площади, задание на определение подмножеств и изображение кругов Эйлера-Венна, вычислительные ошибки.\n\n\n\n3. Причины, указанных выше затруднений у обучающихся при выполнении заданий:\n\nСлабые знания теоретического материал на практике, невнимательность.\n\n\n\n4. Планируемая коррекционная работа: Дополнительная работа по указанным проблемам на этапе актуализации урока по указанным проблемам, не допускать вычислительных ошибок. 	Дата: 21.10.2024\n\n\n\n\n\nПедагог:                        Бабич И.Д.\n\n" 
};

// A simple parser to structure the mock data
const parseInitialData = (data: typeof initialAnalysisData) => {
  const lines = data.content.split('\n').filter(line => line.trim() !== '');
  
  const structuredData = {
    title: lines[0],
    quarter: lines[1],
    subject: lines[2],
    class: lines[3],
    studentsCount: lines[4],
    teacher: lines[5],
    goal: lines[6],
    resultsTable: [
      lines.slice(12, 16),
      lines.slice(17, 21),
      lines.slice(21, 25),
    ],
    goalsTable: [
       lines.slice(27, 32),
       lines.slice(32, 40),
       lines.slice(40, 51),
    ],
    analysis: lines.slice(52, lines.length - 2).join('\n'),
    date: lines[lines.length - 2].split('\t')[1],
    pedagog: lines[lines.length - 1],
  };

  return structuredData;
};


const SorSochAnalysis: React.FC = () => {
  const [analysisData, setAnalysisData] = useState(parseInitialData(initialAnalysisData));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAnalysisData(prev => ({ ...prev, [name]: value }));
  };

  const handleTableChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, table: string, rowIndex: number, colIndex: number) => {
    const { value } = e.target;
    setAnalysisData(prev => {
        const newTable = [...(prev as any)[table]];
        newTable[rowIndex][colIndex] = value;
        return { ...prev, [table]: newTable };
    });
  };
  
  const handleGoalsTableChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, table: string, rowIndex: number, colIndex: number) => {
    const { value } = e.target;
    setAnalysisData(prev => {
        const newTable = [...(prev as any)[table]];
        newTable[rowIndex][colIndex] = value;
        return { ...prev, [table]: newTable };
    });
  };

  const handleDownload = () => {
    // generateSorSochAnalysisDocx(analysisData);
  };

  return (
    <Paper elevation={3} sx={{ p: 4, mt: 4 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Анализ СОР и СОЧ
      </Typography>

      <Box component="form" noValidate autoComplete="off">
        <TextField fullWidth margin="normal" label="Заголовок" name="title" value={analysisData.title} onChange={handleInputChange} />
        <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Четверть" name="quarter" value={analysisData.quarter} onChange={handleInputChange} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Предмет" name="subject" value={analysisData.subject} onChange={handleInputChange} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Класс" name="class" value={analysisData.class} onChange={handleInputChange} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Количество учащихся" name="studentsCount" value={analysisData.studentsCount} onChange={handleInputChange} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Педагог" name="teacher" value={analysisData.teacher} onChange={handleInputChange} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Цель" name="goal" value={analysisData.goal} onChange={handleInputChange} /></Grid>
        </Grid>

        <Typography variant="h6" sx={{ mt: 3 }}>Результаты</Typography>
        <TableContainer component={Paper} sx={{ my: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Предмет</TableCell>
                <TableCell>Писал</TableCell>
                <TableCell>Макс. балл</TableCell>
                <TableCell>Низкий (0-39%)</TableCell>
                <TableCell>Средний (40-84%)</TableCell>
                <TableCell>Высокий (85-100%)</TableCell>
                <TableCell>% качества</TableCell>
                <TableCell>% успеваемости</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analysisData.resultsTable.map((row, rIndex) => (
                <TableRow key={rIndex}>
                    {row.map((cell, cIndex) => (
                        <TableCell key={cIndex}><TextField variant="standard" value={cell} onChange={e => handleTableChange(e, 'resultsTable', rIndex, cIndex)} /></TableCell>
                    ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h6" sx={{ mt: 3 }}>Цели</Typography>
        <TableContainer component={Paper} sx={{ my: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Достигнутые цели</TableCell>
                <TableCell>Цели, вызвавшие затруднения</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analysisData.goalsTable.map((row, rIndex) => (
                <TableRow key={rIndex}>
                    {row.map((cell, cIndex) => (
                        <TableCell key={cIndex}><TextField multiline fullWidth variant="standard" value={cell} onChange={e => handleGoalsTableChange(e, 'goalsTable', rIndex, cIndex)}/></TableCell>
                    ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TextField
          fullWidth
          margin="normal"
          label="Анализ и выводы"
          name="analysis"
          multiline
          rows={10}
          value={analysisData.analysis}
          onChange={handleInputChange}
        />

        <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Дата" name="date" value={analysisData.date} onChange={handleInputChange} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth margin="normal" label="Педагог" name="pedagog" value={analysisData.pedagog} onChange={handleInputChange} /></Grid>
        </Grid>

      </Box>

      <Box sx={{ mt: 3, textAlign: 'right' }}>
        <Button variant="contained" color="primary" onClick={handleDownload} disabled>
          Скачать DOCX
        </Button>
      </Box>
    </Paper>
  );
};

export default SorSochAnalysis;

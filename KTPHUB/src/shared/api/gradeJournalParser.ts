import * as XLSX from 'xlsx';
import { GradeJournalData } from '../../entities/gradeJournal/model/types';

const processRawJournalData = (data: any[][]): GradeJournalData => {
  // Find the start of the main content by looking for the row with "№ п/п"
  const headerStartIndex = data.findIndex(row => row[0] === '№ п/п');
  if (headerStartIndex === -1) {
    throw new Error('Не удалось найти заголовок таблицы в файле журнала.');
  }

  const metaInfoRows = data.slice(0, headerStartIndex);
  const tableRows = data.slice(headerStartIndex);

  const metaInfo = {
    classInfo: metaInfoRows.find(row => row[0]?.includes('Класс:'))?.[0] || '',
    subject: metaInfoRows.find(row => row[0]?.includes('Предмет:'))?.[0] || '',
    teacherName: metaInfoRows.find(row => row[0]?.includes('ФИО учителя:'))?.[0] || '',
  };

  // The header is composed of 3 rows
  const headerRows = tableRows.slice(0, 3);
  const studentRows = tableRows.slice(3);

  return {
    metaInfo,
    headerRows,
    studentRows,
  };
};


export const parseGradeJournal = (file: File): Promise<GradeJournalData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Не удалось прочитать файл.");
        }

        const workbook = XLSX.read(data, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        console.log("--- Grade Journal Parser ---");
        console.log("Raw JSON data:", JSON.stringify(jsonData, null, 2));

        if (jsonData.length === 0) {
          throw new Error("Файл журнала пуст или имеет неверную структуру.");
        }

        const processedData = processRawJournalData(jsonData);
        console.log("Processed Data:", JSON.stringify(processedData, null, 2));
        resolve(processedData);

      } catch (err: any) {
        console.error("Критическая ошибка парсинга журнала:", err);
        reject(err.message || "Не удалось обработать файл.");
      }
    };

    reader.onerror = () => {
      reject(new Error("Ошибка чтения файла."));
    };

    reader.readAsArrayBuffer(file);
  });
};
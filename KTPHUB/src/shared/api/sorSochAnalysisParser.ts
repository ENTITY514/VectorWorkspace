import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

/**
 * Parses .xlsx, .xls, or .docx files and returns their content as a structured JSON string.
 * @param file The file to parse.
 * @returns A promise that resolves with the JSON string representation of the file content.
 */
export const parseSorSochAnalysis = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Не удалось прочитать файл.");

        let jsonData: any;
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
          const workbook = XLSX.read(data, { type: "buffer" });
          const sheetData: { [sheetName: string]: any } = {};

          workbook.SheetNames.forEach(sheetName => {
              const worksheet = workbook.Sheets[sheetName];
              sheetData[sheetName] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          });
          jsonData = sheetData;
        } else if (fileExtension === 'docx') {
            const result = await mammoth.extractRawText({ arrayBuffer: data as ArrayBuffer });
            jsonData = { content: result.value };
        } else {
            throw new Error(`Неподдерживаемый тип файла: .${fileExtension}`);
        }

        const jsonString = JSON.stringify(jsonData, null, 2);
        console.log("--- SOR/SOCH Analysis Parser Result ---", jsonString);
        resolve(jsonString);

      } catch (err: any) {
        console.error("Критическая ошибка парсинга документа анализа СОР/СОЧ:", err);
        reject(err.message || "Не удалось обработать файл.");
      }
    };

    reader.onerror = () => {
      reject(new Error("Ошибка чтения файла."));
    };

    reader.readAsArrayBuffer(file);
  });
};

// Экспорт таблиц ТУП в Excel (.xlsx).
// Сохранение через saveBinaryFile: в браузере — file-saver,
// в Tauri — диалог сохранения + запись на диск.

import * as XLSX from "xlsx";
import { saveBinaryFile } from "./saver";

export interface ExcelColumn {
  title: string;
  width: number;
}

export interface ExcelSheet {
  sheetName: string;
  headers: ExcelColumn[];
  rows: (string | number)[][];
}

function buildSheet(sheet: ExcelSheet): any {
  const data = [sheet.headers.map((h) => h.title), ...sheet.rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = sheet.headers.map((h) => ({ wch: h.width }));

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const text = String(cell.v ?? "");
      if (text.includes("\n")) {
        cell.s = { alignment: { wrapText: true, vertical: "top" } };
      }
    }
  }
  return ws;
}

/**
 * Экспорт массива строк в .xlsx.
 * Строки с переносами \n выводятся в одну ячейку с wrapText.
 */
export async function exportToExcel(
  fileName: string,
  sheetName: string,
  headers: ExcelColumn[],
  rows: (string | number)[][],
): Promise<void> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet({ sheetName, headers, rows }), sheetName);

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
  await saveBinaryFile(buffer, `${fileName}.xlsx`);
}

/**
 * Экспорт нескольких вкладок в один .xlsx-файл.
 * Каждая вкладка — заголовки + строки с автошириной и переносом текста.
 */
export async function exportToExcelMulti(
  fileName: string,
  sheets: ExcelSheet[],
): Promise<void> {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, buildSheet(sheet), sheet.sheetName);
  }

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
  await saveBinaryFile(buffer, `${fileName}.xlsx`);
}

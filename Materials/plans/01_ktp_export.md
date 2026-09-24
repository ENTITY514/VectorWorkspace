# План 1. Экспорт самого КТП

**Приоритет:** P0  
**Оценка:** 2 дня  
**Зависит от:** ничего  
**Разблокирует:** [план 8 — импорт Excel](./08_ktp_excel_import.md)

## Проблема сейчас

КСП уходит в Word / Excel / PDF из каталога, просмотра и редактора (`kspExport.ts`, `export_ksp_pdf`). КТП для завуча — отдельный документ, и генераторы уже есть:

- `Desktop/src/lib/word-generator.ts`
- `Desktop/src/lib/xlsx-generator.ts` (обычный лист и выгрузка «Кунделик»)
- кнопки в старом `Desktop/src/panels/Ktp.tsx`

Новый список планов (`domains/ktp/ui/KtpList.tsx`, `KtpSavedTable.tsx`) этих кнопок не показывает. Учитель в актуальном UI не может сдать календарь, не открывая мёртвую панель.

PDF КТП нет. Кириллица в PDF КСП решена в Rust (`infra/ksp_pdf.rs`) — тот же путь нужен плану.

## Что делаем

- Вынести вызовы Word / XLSX / Кунделик из `panels/Ktp.tsx` в домен: `domains/ktp/ktpExport.ts`.
- Повесить те же три кнопки на карточку сохранённого плана и на открытый план (как `KspExportBar`).
- Сохранять через `@tauri-apps/plugin-dialog` + `saveBinaryFile`, без браузерных фоллбэков.
- Имя файла: `{предмет}_{класс}_{год}.docx|xlsx`.
- PDF — отдельным шагом в Rust (`export_ktp_pdf`), не через html2canvas.
- Экспорт — снимок. Шапка связанных КСП не меняется.

## Критерий приёмки

Из `KtpList` учитель скачивает Word и оба Excel текущего плана. Файл открывается, колонки совпадают со схемой урока (номер, дата, раздел, тема, цели, тип). Кнопка «Кунделик XLSX» даёт тот же профиль, что старая панель. Старый `panels/Ktp.tsx` либо вызывает тот же модуль, либо теряет свои кнопки.

## Файлы

- `Desktop/src/lib/word-generator.ts`
- `Desktop/src/lib/xlsx-generator.ts`
- `Desktop/src/domains/ktp/ktpExport.ts` (новый)
- `Desktop/src/domains/ktp/ui/KtpSavedTable.tsx`
- `Desktop/src/domains/ktp/ui/KtpExportBar.tsx` (новый)
- `Desktop/src/panels/Ktp.tsx` (свести к общему модулю)
- позже: `Desktop/src-tauri/src/infra/ktp_pdf.rs`, `commands/ktp.rs`

## Вне скоупа

Редактор выгрузки. Правка плана из Excel. Смена шапки КСП после экспорта.

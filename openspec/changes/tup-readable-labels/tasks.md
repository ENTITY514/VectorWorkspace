## 1. Модуль подписей

- [x] 1.1 Создать `src/domains/tup/labels.ts` с функциями `directionLabel`, `directionFull`, `languageLabel`, `entityTypeLabel`, возвращающими русские подписи и не ломающимися на неизвестных значениях.

## 2. Источник directionStr

- [x] 2.1 В `services/api.ts` формировать `directionStr` через `directionLabel(d.direction)` вместо сырого `common`/`emn`/`ogn`.
- [x] 2.2 В `useTupList.ts` собирать уникальные направления без исключения `common` (чтобы «Общеобразовательная» была в фильтре).

## 3. Карточка документа (TupDocumentCard)

- [x] 3.1 Бейдж направления: текст `directionLabel(doc.directionStr)` + `title={directionFull(doc.directionStr)}`.
- [x] 3.2 Бейдж языка: `languageLabel(doc.language)` вместо `doc.language.toUpperCase()`.
- [x] 3.3 `Прил.` → `Приложение`; бейдж `ДСП` снабдить `title` с расшифровкой.

## 4. Деталь документа (TupDetail)

- [x] 4.1 Направление: `directionLabel(detail.direction)` + `title={directionFull(...)}` вместо ручной цепочки `ЕМН/ОГН/Жалпы/Общее`.
- [x] 4.2 Язык: `languageLabel(detail.language)` вместо сырого значения.

## 5. Список и поиск (TupList)

- [x] 5.1 Опции фильтра направления — `directionLabel(d)`; опции фильтра языка — `languageLabel(l)`.
- [x] 5.2 Мета FTS-результата: язык через `languageLabel`; бейдж типа сущности — `entityTypeLabel(h.entityType)`.
- [x] 5.3 Убрать техническое `FTS5` из подсказки полнотекстового поиска.

## 6. Проверка

- [x] 6.1 `npx tsc --noEmit` — без ошибок типов.
- [x] 6.2 `npx vite build` — сборка успешна.

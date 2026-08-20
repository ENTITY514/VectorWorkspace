## 1. History Machine Implementation

- [x] 1.1 Добавить `futureLabels` в `HistoryMachine<T>` в `Desktop/src/ktp/history.ts` для поддержки восстановления меток действий при `redo()`.
- [x] 1.2 Написать юнит-тесты для `HistoryMachine` в `Desktop/src/ktp/history.test.ts` (проверка меток при undo/redo и капа стека).

## 2. Editor UI Keyboard Shortcuts Isolation

- [x] 2.1 Обновить обработчик `keydown` в `Desktop/src/panels/KtpEditor.tsx` с проверкой `e.target` на `INPUT`, `TEXTAREA` и `isContentEditable`.
- [x] 2.2 Исправить динамические ключи элементов истории в UI редактора.

## 3. Verification

- [x] 3.1 Запустить unit-тесты `npm test` и убедиться, что все тесты истории прододят.
- [x] 3.2 Запустить компилятор TypeScript `npx tsc --noEmit`.

## Context

Текущая реализация `HistoryMachine` в `Desktop/src/ktp/history.ts` хранит `past`, `present`, `future` и `labels`. При `undo()` метка удаляется, а при `redo()` добавляется фиксированная метка `"Повторить"`. В `KtpEditor.tsx` горячие клавиши `Ctrl+Z` / `Ctrl+Y` глобально перехватывают ввод через `window.addEventListener("keydown")` без проверки фокуса в элементах ввода текста.

## Goals / Non-Goals

**Goals:**
- Изолировать обработчик `keydown` от `HTMLInputElement`, `HTMLTextAreaElement` и `isContentEditable`.
- Добавить `futureLabels` в `HistoryMachine<T>` для синхронного восстановления оригинальных меток действий при `redo()`.
- Использовать уникальный идентификатор или стабильный ключ в списке истории React.

**Non-Goals:**
- Изменение структуры плана `FlatPlan` или серверной модели БД.

## Decisions

- **Стек `futureLabels`**: В `HistoryMachine` добавляется поле `private futureLabels: HistoryEntry[] = []`. При `undo()` удаленная метка помещается в начало `futureLabels`, а при `redo()` берется из него.
- **Проверка `e.target`**: В обработчике `onKey` добавляется проверка `target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)`.

## Risks / Trade-offs

- [Risk] Нажатие `Ctrl+Z` при выделении инпута сбросит только текст внутри инпута.
  - Mitigation: Это стандартное системное поведение всех desktop/web-редакторов.

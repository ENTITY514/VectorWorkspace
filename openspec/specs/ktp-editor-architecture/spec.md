# KTP Editor Architecture Specification

This specification documents the current state and structure of the KTP Editor in `VectorWorkspace`, serving as a baseline before its refactoring.

## 1. Overview
The KTP Editor (`KtpEditor.tsx`) is the central module for managing "Kalendarno-Tematicheskiy Plan" (KTP). It allows users to:
- View the curriculum plan.
- Reorder lessons using Drag and Drop.
- Split, merge, and edit individual lessons and objectives.
- Perform Undo/Redo operations.
- Generate Word and Excel documents.

## 2. Core Components

### 2.1 KtpEditor.tsx (UI & State)
Currently a monolithic React component (~1000 lines) handling:
- **State Management:** `plan` (the curriculum), `tup` (the source document context).
- **History Management:** Uses `useHistory` hook (which wraps `HistoryMachine`) to provide undo/redo capabilities. Subscribes to global keyboard events (`Ctrl+Z`, `Ctrl+Y`).
- **Drag and Drop:** Uses `@dnd-kit/core` and `@dnd-kit/sortable`. Manages `onDragEnd` to reorder rows or merge objectives.
- **Rendering:** Renders the header (controls) and a list of `SortableContext` items (Lessons, Hours, SORs, Objectives).

### 2.2 editorModel.ts (Business Logic)
Contains pure functions for transforming the KTP state. 
- `flattenPlan` / `unflattenPlan`: Converts hierarchical plan into a flat list for Drag-and-Drop and back.
- `renumberPlan`: Recalculates lesson numbers and hours.
- `updateLessonInPlan`: Modifies a specific lesson.
- `splitObjectivesInPlan`, `mergeObjectivesIntoLesson`, `mergeLessonWithNext`: Manipulate lesson and objective associations.
- `reorderPlan`: Handles the array mutations post-Drag-and-Drop.

### 2.3 history.ts (State Machine)
- `HistoryMachine`: Manages `labels` (undo stack) and `futureLabels` (redo stack). Applies patches/state changes using a state-saving paradigm.

## 3. Current Flaws (Targets for Refactoring)
- **Monolithic UI:** `KtpEditor.tsx` handles too many responsibilities (Dnd Setup, Header rendering, Row rendering, state mutation).
- **Mixed Concerns:** Word/Excel generation logic is tightly coupled with UI triggers.
- **Styling:** Relies on a massive global `styles.css`.

## 4. Documented State
This spec solidifies the *functional requirements* of the KTP Editor. Any refactored components MUST fulfill these exact responsibilities: Drag & Drop, History, transformations via `editorModel`, and generation of outputs.

// src/store/store.ts

import { configureStore } from "@reduxjs/toolkit";
import { academicPlanReducer } from "../entities/circulumPlan/model/slice";
import { ktpEditorReducer } from "../entities/ktp/model/slice";
import { calendarReducer } from "../entities/calendar/model/slice";
import { gradeJournalReducer } from "../entities/gradeJournal/model/slice";
import { titlePageReducer } from "../entities/titlePage/model/slice";
import { explanatoryNoteReducer } from "../entities/explanatoryNote/model/slice";

export const store = configureStore({
  reducer: {
    academicPlan: academicPlanReducer,
    ktpEditor: ktpEditorReducer,
    calendar: calendarReducer,
    gradeJournal: gradeJournalReducer,
    titlePage: titlePageReducer,
    explanatoryNote: explanatoryNoteReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

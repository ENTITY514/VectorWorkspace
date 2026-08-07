import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GradeJournalData } from './types';

interface GradeJournalState {
  journalData: GradeJournalData | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: GradeJournalState = {
  journalData: null,
  status: 'idle',
  error: null,
};

const gradeJournalSlice = createSlice({
  name: 'gradeJournal',
  initialState,
  reducers: {
    setJournalData(state, action: PayloadAction<GradeJournalData>) {
      state.journalData = action.payload;
      state.status = 'succeeded';
      state.error = null;
    },
    setJournalLoading(state) {
      state.status = 'loading';
    },
    setJournalError(state, action: PayloadAction<string>) {
      state.status = 'failed';
      state.error = action.payload;
    },
  },
});

export const { setJournalData, setJournalLoading, setJournalError } = gradeJournalSlice.actions;
export const gradeJournalReducer = gradeJournalSlice.reducer;

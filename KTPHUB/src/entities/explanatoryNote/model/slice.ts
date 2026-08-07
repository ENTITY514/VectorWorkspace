// src/entities/explanatoryNote/model/slice.ts

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ExplanatoryNoteData } from "./types";
import { EXPLANATORY_NOTE_PRESETS } from "./presets";

interface ExplanatoryNoteState {
  presets: ExplanatoryNoteData[];
  activeNote: ExplanatoryNoteData;
  customNotes: ExplanatoryNoteData[];
}

const STORAGE_KEY = "explanatoryNotes_custom";

const loadSavedNotes = (): ExplanatoryNoteData[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const initialState: ExplanatoryNoteState = {
  presets: EXPLANATORY_NOTE_PRESETS,
  activeNote: EXPLANATORY_NOTE_PRESETS[0],
  customNotes: loadSavedNotes(),
};

export const explanatoryNoteSlice = createSlice({
  name: "explanatoryNote",
  initialState,
  reducers: {
    selectNotePreset: (state, action: PayloadAction<string>) => {
      const found =
        state.presets.find((p) => p.id === action.payload) ||
        state.customNotes.find((p) => p.id === action.payload);
      if (found) {
        state.activeNote = JSON.parse(JSON.stringify(found));
      }
    },
    updateActiveNote: (state, action: PayloadAction<Partial<ExplanatoryNoteData>>) => {
      state.activeNote = {
        ...state.activeNote,
        ...action.payload,
      };
    },
    saveCurrentNoteAsCustom: (state, action: PayloadAction<string>) => {
      const newNote: ExplanatoryNoteData = {
        ...JSON.parse(JSON.stringify(state.activeNote)),
        id: `custom-exp-${Date.now()}`,
        presetName: action.payload || "Пользовательская пояснительная записка",
      };
      state.customNotes.push(newNote);
      state.activeNote = newNote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customNotes));
    },
    resetNoteToDefault: (state) => {
      state.activeNote = JSON.parse(JSON.stringify(EXPLANATORY_NOTE_PRESETS[0]));
    },
  },
});

export const {
  selectNotePreset,
  updateActiveNote,
  saveCurrentNoteAsCustom,
  resetNoteToDefault,
} = explanatoryNoteSlice.actions;

export const explanatoryNoteReducer = explanatoryNoteSlice.reducer;

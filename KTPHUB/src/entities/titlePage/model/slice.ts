// src/entities/titlePage/model/slice.ts

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TitlePageData } from "./types";
import { TITLE_PAGE_PRESETS } from "./presets";

interface TitlePageState {
  presets: TitlePageData[];
  activeTitlePage: TitlePageData;
  customTitlePages: TitlePageData[];
}

const STORAGE_KEY = "titlePages_custom";

const loadSavedPages = (): TitlePageData[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const initialState: TitlePageState = {
  presets: TITLE_PAGE_PRESETS,
  activeTitlePage: TITLE_PAGE_PRESETS[0],
  customTitlePages: loadSavedPages(),
};

export const titlePageSlice = createSlice({
  name: "titlePage",
  initialState,
  reducers: {
    selectPreset: (state, action: PayloadAction<string>) => {
      const found =
        state.presets.find((p) => p.id === action.payload) ||
        state.customTitlePages.find((p) => p.id === action.payload);
      if (found) {
        state.activeTitlePage = JSON.parse(JSON.stringify(found));
      }
    },
    updateActiveTitlePage: (state, action: PayloadAction<Partial<TitlePageData>>) => {
      const updated = {
        ...state.activeTitlePage,
        ...action.payload,
      };

      if (action.payload.academicYear) {
        const yearPattern = /\b20\d\d-20\d\d\b/g;
        if (updated.titleKz) {
          updated.titleKz = updated.titleKz.replace(yearPattern, action.payload.academicYear);
        }
        if (updated.titleRu) {
          updated.titleRu = updated.titleRu.replace(yearPattern, action.payload.academicYear);
        }
      }

      state.activeTitlePage = updated;
    },
    saveCurrentAsCustom: (state, action: PayloadAction<string>) => {
      const newPage: TitlePageData = {
        ...JSON.parse(JSON.stringify(state.activeTitlePage)),
        id: `custom-${Date.now()}`,
        presetName: action.payload || "Пользовательский титульный лист",
      };
      state.customTitlePages.push(newPage);
      state.activeTitlePage = newPage;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customTitlePages));
    },
    resetToDefault: (state) => {
      state.activeTitlePage = JSON.parse(JSON.stringify(TITLE_PAGE_PRESETS[0]));
    },
  },
});

export const {
  selectPreset,
  updateActiveTitlePage,
  saveCurrentAsCustom,
  resetToDefault,
} = titlePageSlice.actions;

export const titlePageReducer = titlePageSlice.reducer;

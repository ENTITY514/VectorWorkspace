// src/entities/academic-plan/model/slice.ts

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AcademicPlan, StoredTup } from './types';

interface AcademicPlanState {
  tupList: StoredTup[];
}

// Попытка загрузить начальное состояние. Временная мера.
const loadState = (): StoredTup[] => {
  try {
    const savedData = localStorage.getItem("academicPlanData");
    if (!savedData) return [];
    const parsed = JSON.parse(savedData);
    if (Array.isArray(parsed) && parsed[0]?.id && parsed[0]?.name && parsed[0]?.planData) {
      return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
};

const initialState: AcademicPlanState = {
  tupList: loadState(),
};

const academicPlanSlice = createSlice({
  name: 'academicPlan',
  initialState,
  reducers: {
    addTup(state, action: PayloadAction<AcademicPlan>) {
      const newTup: StoredTup = {
        id: Date.now().toString(),
        name: `Новый учебный план от ${new Date().toLocaleDateString()}`,
        planData: action.payload,
      };
      state.tupList.push(newTup);
      localStorage.setItem("academicPlanData", JSON.stringify(state.tupList));
    },
    renameTup(state, action: PayloadAction<{ id: string; newName: string }>) {
      const { id, newName } = action.payload;
      const tup = state.tupList.find(t => t.id === id);
      if (tup) {
        tup.name = newName;
        localStorage.setItem("academicPlanData", JSON.stringify(state.tupList));
      }
    },
    removeTup(state, action: PayloadAction<string>) {
        state.tupList = state.tupList.filter(t => t.id !== action.payload);
        localStorage.setItem("academicPlanData", JSON.stringify(state.tupList));
    },
    upsertTup(state, action: PayloadAction<StoredTup>) {
      const index = state.tupList.findIndex((t) => t.id === action.payload.id);
      if (index >= 0) {
        state.tupList[index] = action.payload;
      } else {
        state.tupList.push(action.payload);
      }
      localStorage.setItem("academicPlanData", JSON.stringify(state.tupList));
    },
  },
});

export const { addTup, renameTup, removeTup, upsertTup } = academicPlanSlice.actions;
export const academicPlanReducer = academicPlanSlice.reducer;
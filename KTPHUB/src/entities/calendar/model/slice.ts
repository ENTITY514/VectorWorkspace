// src/entities/calendar/model/slice.ts

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { CalendarState, QuarterDates, CalendarProfile } from "./types";
import { getKzProductionCalendar } from "../../../shared/services/kzCalendarService";

const createNewProfile = (name: string): CalendarProfile => ({
  id: uuidv4(),
  name,
  quarters: {
    q1: { start: "2025-09-01", end: "2025-10-26" },
    q2: { start: "2025-11-03", end: "2025-12-28" },
    q3: { start: "2026-01-08", end: "2026-03-20" },
    q4: { start: "2026-03-31", end: "2026-05-25" },
  },
  additionalHolidays: [],
});

const getInitialState = (): CalendarState => {
  const defaultProfile = createNewProfile("Стандарт (2025-2026)");
  const juniorProfile = createNewProfile("Младшие классы");
  juniorProfile.additionalHolidays.push({
    id: uuidv4(),
    start: "2026-02-09",
    end: "2026-02-15",
    name: "Доп. каникулы для 1-х классов",
  });

  const initialKzHolidays = [
    ...getKzProductionCalendar(2025),
    ...getKzProductionCalendar(2026),
  ].map((h) => ({ id: uuidv4(), date: h.date, name: h.name, isTransfer: h.isTransfer }));

  return {
    profiles: [defaultProfile, juniorProfile],
    activeProfileId: defaultProfile.id,
    holidays: initialKzHolidays,
    status: "idle",
    error: null,
  };
};

const loadState = (): CalendarState => {
  try {
    const serializedState = localStorage.getItem("calendarSettings");
    if (serializedState === null) {
      return getInitialState();
    }
    const state = JSON.parse(serializedState);
    state.profiles = state.profiles.map((p: any) => ({
      ...p,
      additionalHolidays: p.additionalHolidays || [],
    }));
    return state;
  } catch (err) {
    return getInitialState();
  }
};

const saveState = (state: CalendarState) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem("calendarSettings", serializedState);
  } catch {
    // ignore write errors
  }
};

const calendarSlice = createSlice({
  name: "calendar",
  initialState: loadState(),
  reducers: {
    setActiveProfile(state, action: PayloadAction<string>) {
      if (state.profiles.some((p) => p.id === action.payload)) {
        state.activeProfileId = action.payload;
        saveState(state);
      }
    },
    addProfile(state, action: PayloadAction<string>) {
      const newProfile = createNewProfile(action.payload);
      state.profiles.push(newProfile);
      state.activeProfileId = newProfile.id;
      saveState(state);
    },
    removeActiveProfile(state) {
      if (state.profiles.length <= 1 || !state.activeProfileId) return;
      state.profiles = state.profiles.filter(
        (p) => p.id !== state.activeProfileId
      );
      state.activeProfileId = state.profiles[0]?.id || null;
      saveState(state);
    },
    updateActiveProfileName(state, action: PayloadAction<string>) {
      const activeProfile = state.profiles.find(
        (p) => p.id === state.activeProfileId
      );
      if (activeProfile) {
        activeProfile.name = action.payload;
        saveState(state);
      }
    },
    setQuarterDateForActiveProfile(
      state,
      action: PayloadAction<{
        quarter: keyof CalendarProfile["quarters"];
        dates: QuarterDates;
      }>
    ) {
      const activeProfile = state.profiles.find(
        (p) => p.id === state.activeProfileId
      );
      if (activeProfile) {
        activeProfile.quarters[action.payload.quarter] = action.payload.dates;
        saveState(state);
      }
    },
    addHoliday(state, action: PayloadAction<{ date: string; name: string }>) {
      state.holidays.push({ id: uuidv4(), ...action.payload });
      state.holidays.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      saveState(state);
    },
    removeHoliday(state, action: PayloadAction<{ id: string }>) {
      state.holidays = state.holidays.filter(
        (holiday) => holiday.id !== action.payload.id
      );
      saveState(state);
    },
    loadKzProductionCalendarForYears(state, action: PayloadAction<number[]>) {
      const years = action.payload;
      const computed: Array<{ id: string; date: string; name: string; isTransfer?: boolean }> = [];
      years.forEach((y) => {
        getKzProductionCalendar(y).forEach((h) => {
          computed.push({ id: uuidv4(), date: h.date, name: h.name, isTransfer: h.isTransfer });
        });
      });
      state.holidays = computed;
      state.holidays.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      saveState(state);
    },
    addAdditionalHoliday(
      state,
      action: PayloadAction<{ start: string; end: string; name: string }>
    ) {
      const activeProfile = state.profiles.find(
        (p) => p.id === state.activeProfileId
      );
      if (activeProfile) {
        activeProfile.additionalHolidays.push({
          id: uuidv4(),
          ...action.payload,
        });
        saveState(state);
      }
    },
    removeAdditionalHoliday(state, action: PayloadAction<{ id: string }>) {
      const activeProfile = state.profiles.find(
        (p) => p.id === state.activeProfileId
      );
      if (activeProfile) {
        activeProfile.additionalHolidays =
          activeProfile.additionalHolidays.filter(
            (h) => h.id !== action.payload.id
          );
        saveState(state);
      }
    },
  },
});

export const {
  setActiveProfile,
  addProfile,
  removeActiveProfile,
  updateActiveProfileName,
  setQuarterDateForActiveProfile,
  addHoliday,
  removeHoliday,
  loadKzProductionCalendarForYears,
  addAdditionalHoliday,
  removeAdditionalHoliday,
} = calendarSlice.actions;

export const calendarReducer = calendarSlice.reducer;
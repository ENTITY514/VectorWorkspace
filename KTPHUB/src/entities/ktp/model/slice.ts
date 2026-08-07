import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../../store/store";
import { transformTupToKtp, renumberPlan } from "./lib";
import { KtpPlan, IKtpLesson, LessonRowType, DayOfWeek, ILessonObjective } from "./types";
import { arrayMove } from "@dnd-kit/sortable";
import { v4 as uuidv4 } from "uuid";
import { CalendarProfile, Holiday } from "../../calendar/model/types";

const toYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface SavedKtp {
  id: string;
  name: string;
  className: string;
  plan: KtpPlan;
  totalHours: number;
  quarterWorkHours: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
  };
}

interface KtpEditorState {
  plan: KtpPlan;
  sourceTupName: string;
  className: string;
  totalHours: number;
  quarterWorkHours: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
  };
  savedKtps: SavedKtp[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  autofillError: string | null;
}

const initialState: KtpEditorState = {
  plan: [],
  sourceTupName: "",
  className: "",
  totalHours: 0,
  quarterWorkHours: { q1: 0, q2: 0, q3: 0, q4: 0 },
  savedKtps: [],
  status: "idle",
  error: null,
  autofillError: null,
};

export const createKtpFromTup = createAsyncThunk<
  SavedKtp,
  string,
  { state: RootState }
>("ktpEditor/createFromTup", (tupId, { getState, rejectWithValue }) => {
  const state = getState();
  const allTups = state.academicPlan.tupList;

  const sourceTup = allTups.find(t => t.id === tupId);
  if (!sourceTup) {
    return rejectWithValue("Исходный ТУП не найден.");
  }
  const transformedPlan = transformTupToKtp(sourceTup.planData);
  const newKtp: SavedKtp = {
    id: uuidv4(),
    name: sourceTup.name,
    className: "", // Default class name
    plan: transformedPlan,
    totalHours: 0,
    quarterWorkHours: { q1: 0, q2: 0, q3: 0, q4: 0 },
  };

  try {
    const ktps = JSON.parse(localStorage.getItem('ktps') || '[]') as SavedKtp[];
    ktps.push(newKtp);
    localStorage.setItem('ktps', JSON.stringify(ktps));
    return newKtp;
  } catch (error) {
    console.error("Failed to save KTP to localStorage", error);
    return rejectWithValue("Ошибка сохранения КТП");
  }
});

const ktpEditorSlice = createSlice({
  name: "ktpEditor",
  initialState,
  reducers: {
    setClassName(state, action: PayloadAction<string>) {
      state.className = action.payload;
    },
    updateLesson(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof IKtpLesson;
        value: string | number | ILessonObjective[];
      }> 
    ) {
      const { id, field, value } = action.payload;
      const lesson = state.plan.find((l) => l.id === id);
      if (lesson) {
        (lesson as any)[field] = value;
      }
    },

    addHour(state, action: PayloadAction<{ lessonId: string }>) {
      const lessonIndex = state.plan.findIndex(
        (l) => l.id === action.payload.lessonId
      );
      if (lessonIndex === -1) return;

      const originalLesson = state.plan[lessonIndex];
      const newHour: IKtpLesson = {
        ...originalLesson,
        id: `${originalLesson.id}-hour-${Date.now()}`,
        date: "",
        notes: "",
      };

      state.plan.splice(lessonIndex + 1, 0, newHour);
      state.plan = renumberPlan(state.plan);
    },

    deleteLesson(state, action: PayloadAction<{ lessonId: string }>) {
      state.plan = state.plan.filter((l) => l.id !== action.payload.lessonId);
      state.plan = renumberPlan(state.plan);
    },

    reorderPlan(
      state,
      action: PayloadAction<{ activeId: string; overId: string }>
    ) {
      const { activeId, overId } = action.payload;
      const oldIndex = state.plan.findIndex((item) => item.id === activeId);
      const newIndex = state.plan.findIndex((item) => item.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        state.plan = renumberPlan(arrayMove(state.plan, oldIndex, newIndex));
      }
    },

    mergeObjectives(
      state,
      action: PayloadAction<{ sourceLessonId: string; targetLessonId: string }>
    ) {
      const { sourceLessonId, targetLessonId } = action.payload;
      const sourceLesson = state.plan.find((l) => l.id === sourceLessonId);
      const targetLesson = state.plan.find((l) => l.id === targetLessonId);

      if (sourceLesson && targetLesson) {
        targetLesson.objectives.push(...sourceLesson.objectives);
        state.plan = state.plan.filter((l) => l.id !== sourceLessonId);
        state.plan = renumberPlan(state.plan);
      }
    },

    splitAllObjectives(state, action: PayloadAction<{ lessonId: string }>) {
      const { lessonId } = action.payload;
      const lessonIndex = state.plan.findIndex((l) => l.id === lessonId);
      if (lessonIndex === -1) return;

      const originalLesson = state.plan[lessonIndex];
      if (originalLesson.objectives.length < 2) return;

      const objectivesToSplit = originalLesson.objectives.slice(1);
      originalLesson.objectives = [originalLesson.objectives[0]];

      const newLessons = objectivesToSplit.map((objective) => ({
        ...originalLesson,
        id: uuidv4(),
        objectives: [objective],
      }));

      state.plan.splice(lessonIndex + 1, 0, ...newLessons);
      state.plan = renumberPlan(state.plan);
    },

    addSor(state, action: PayloadAction<{ lessonId: string }>) {
      const lastLessonIndex = state.plan.findIndex(
        (l) => l.id === action.payload.lessonId
      );
      if (lastLessonIndex === -1) {
        console.warn("Last lesson of the section not found.");
        return;
      }

      const sectionLastLesson = state.plan[lastLessonIndex];

      const totalSorCount = state.plan.filter(
        (l) => l.rowType === LessonRowType.SOR
      ).length;

      const newSor: IKtpLesson = {
        ...sectionLastLesson,
        id: uuidv4(),
        lessonTopic: `${sectionLastLesson.lessonTopic}\nСОР №${totalSorCount + 1} по разделу "${ 
          sectionLastLesson.sectionName
        }"`, 
        objectives: sectionLastLesson.objectives,
        hours: 1,
        date: "",
        notes: "",
        rowType: LessonRowType.SOR,
      };

      const newHour: IKtpLesson = { ...sectionLastLesson, id: uuidv4() };

      const newIndex = lastLessonIndex + 1;
      state.plan.splice(newIndex, 0, newSor, newHour);
      state.plan = renumberPlan(state.plan);
    },

    autofillDates(
      state,
      action: PayloadAction<{
        startQuarter: keyof CalendarProfile["quarters"];
        selectedDays: DayOfWeek[];
        calendarProfile: CalendarProfile;
        holidays: Holiday[];
      }>
    ) {
      const { startQuarter, selectedDays, calendarProfile, holidays } =
        action.payload;

      state.autofillError = null;

      // Эффективный набор праздничных дней с учетом переносов с выходных
      const allHolidays = new Set<string>();
      holidays.forEach((h) => {
        allHolidays.add(h.date);
        const d = new Date(h.date + 'T00:00:00');
        const day = d.getDay();
        if (day === 6) { // Суббота -> Перенос на понедельник
          const mon = new Date(d);
          mon.setDate(mon.getDate() + 2);
          allHolidays.add(toYYYYMMDD(mon));
        } else if (day === 0) { // Воскресенье -> Перенос на понедельник
          const mon = new Date(d);
          mon.setDate(mon.getDate() + 1);
          allHolidays.add(toYYYYMMDD(mon));
        }
      });

      calendarProfile.additionalHolidays.forEach((h) => {
        const start = new Date(h.start + 'T00:00:00');
        const end = new Date(h.end + 'T00:00:00');
        let curr = new Date(start);
        while (curr <= end) {
          allHolidays.add(toYYYYMMDD(curr));
          curr.setDate(curr.getDate() + 1);
        }
      });

      const isHoliday = (date: Date) => allHolidays.has(toYYYYMMDD(date));

      const dayMap: { [key: number]: DayOfWeek } = {
        0: "воскресенье",
        1: "понедельник",
        2: "вторник",
        3: "среда",
        4: "четверг",
        5: "пятница",
        6: "суббота",
      };

      const quarterKeys: Array<keyof CalendarProfile["quarters"]> = ["q1", "q2", "q3", "q4"];
      const startQuarterIndex = quarterKeys.indexOf(startQuarter);
      if (startQuarterIndex === -1) return;

      // Разделяем уроки по четвертям на основе QUARTER_HEADER
      const quarterLessonsMap: { [key in keyof CalendarProfile["quarters"]]?: typeof state.plan } = {
        q1: [],
        q2: [],
        q3: [],
        q4: [],
      };

      let currentQIndex = 0;
      state.plan.forEach((lesson) => {
        if (lesson.rowType === LessonRowType.QUARTER_HEADER) {
          // Проверяем явное указание номера четверти или берем по счетчику
          if (lesson.sectionName.includes("1")) currentQIndex = 0;
          else if (lesson.sectionName.includes("2")) currentQIndex = 1;
          else if (lesson.sectionName.includes("3")) currentQIndex = 2;
          else if (lesson.sectionName.includes("4")) currentQIndex = 3;
          else if (currentQIndex < 3) currentQIndex++;
        } else {
          const qKey = quarterKeys[currentQIndex];
          if (qKey && quarterLessonsMap[qKey]) {
            quarterLessonsMap[qKey]!.push(lesson);
          }
        }
      });

      // Генерируем учебные дни для каждой четверти
      const availableDatesMap: { [key in keyof CalendarProfile["quarters"]]?: string[] } = {};
      quarterKeys.forEach((qKey) => {
        const qDates = calendarProfile.quarters[qKey];
        if (!qDates) return;
        const dates: string[] = [];
        const start = new Date(qDates.start + 'T00:00:00');
        const end = new Date(qDates.end + 'T00:00:00');
        let tempDate = new Date(start);

        while (tempDate <= end) {
          const dayOfWeek = dayMap[tempDate.getDay()];
          if (selectedDays.includes(dayOfWeek) && !isHoliday(tempDate)) {
            dates.push(toYYYYMMDD(tempDate));
          }
          tempDate.setDate(tempDate.getDate() + 1);
        }
        availableDatesMap[qKey] = dates;
      });

      // Проверка совпадения количества дней
      let totalNeeded = 0;
      let totalAvail = 0;
      for (let i = startQuarterIndex; i < quarterKeys.length; i++) {
        const qKey = quarterKeys[i];
        totalNeeded += (quarterLessonsMap[qKey] || []).length;
        totalAvail += (availableDatesMap[qKey] || []).length;
      }

      if (totalNeeded > totalAvail) {
        state.autofillError = `Недостаточно учебных дней. Не хватает ${totalNeeded - totalAvail} дн.`;
        return;
      }

      // Проставляем даты по четвертям
      for (let i = startQuarterIndex; i < quarterKeys.length; i++) {
        const qKey = quarterKeys[i];
        const lessons = quarterLessonsMap[qKey] || [];
        const dates = availableDatesMap[qKey] || [];
        lessons.forEach((lesson, idx) => {
          if (dates[idx]) {
            lesson.date = dates[idx];
          }
        });
      }
    },
    clearAutofillError(state) {
      state.autofillError = null;
    },
    setTotalHours(state, action: PayloadAction<number>) {
      state.totalHours = action.payload;
    },
    setQuarterWorkHours(state, action: PayloadAction<{ quarter: keyof KtpEditorState['quarterWorkHours'], hours: number }>) {
      state.quarterWorkHours[action.payload.quarter] = action.payload.hours;
    },
    saveKtpToLocalStorage(state, action: PayloadAction<{ name: string; id?: string; className: string; }>) {
      try {
        const { name, id, className } = action.payload;
        const ktps = JSON.parse(localStorage.getItem('ktps') || '[]') as SavedKtp[];
        const ktpData: SavedKtp = {
          id: id || uuidv4(),
          name,
          className,
          plan: state.plan,
          totalHours: state.totalHours,
          quarterWorkHours: state.quarterWorkHours,
        };

        const existingIndex = ktps.findIndex(k => k.id === ktpData.id);
        if (existingIndex !== -1) {
          ktps[existingIndex] = ktpData;
        } else {
          ktps.push(ktpData);
        }

        localStorage.setItem('ktps', JSON.stringify(ktps));
        state.savedKtps = ktps;
      } catch (error) {
        console.error("Failed to save KTP to localStorage", error);
      }
    },
    loadKtpsFromLocalStorage(state) {
      try {
        const ktps = JSON.parse(localStorage.getItem('ktps') || '[]') as SavedKtp[];
        state.savedKtps = ktps;
      } catch (error) {
        console.error("Failed to load KTPs from localStorage", error);
      }
    },
    setKtpForEditing(state, action: PayloadAction<string>) {
      const ktpId = action.payload;
      state.status = "loading";
      const ktp = state.savedKtps.find((k) => k.id === ktpId);
      if (ktp) {
        state.plan = ktp.plan;
        state.totalHours = ktp.totalHours;
        state.quarterWorkHours = ktp.quarterWorkHours;
        state.sourceTupName = ktp.name;
        state.className = ktp.className;
        state.status = "succeeded";
        state.error = null;
      } else {
        state.status = "failed";
        state.error = `КТП с ID "${ktpId}" не найден.`;
      }
    },
    updateKtpName(state, action: PayloadAction<{ id: string; name: string }>) {
      try {
        const { id, name } = action.payload;
        const ktps = JSON.parse(localStorage.getItem('ktps') || '[]') as SavedKtp[];
        const ktpIndex = ktps.findIndex(k => k.id === id);
        if (ktpIndex !== -1) {
          ktps[ktpIndex].name = name;
          localStorage.setItem('ktps', JSON.stringify(ktps));
          state.savedKtps = ktps;
        }
      } catch (error) {
        console.error("Failed to update KTP name in localStorage", error);
      }
    },
    deleteKtp(state, action: PayloadAction<string>) {
      try {
        const ktpId = action.payload;
        let ktps = JSON.parse(localStorage.getItem('ktps') || '[]') as SavedKtp[];
        ktps = ktps.filter(k => k.id !== ktpId);
        localStorage.setItem('ktps', JSON.stringify(ktps));
        state.savedKtps = ktps;
      } catch (error) {
        console.error("Failed to delete KTP from localStorage", error);
      }
    },
    resetKtpEditor(state) {
      state.plan = [];
      state.sourceTupName = "";
      state.className = "";
      state.totalHours = 0;
      state.quarterWorkHours = { q1: 0, q2: 0, q3: 0, q4: 0 };
      state.status = "idle";
      state.error = null;
      state.autofillError = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(createKtpFromTup.pending, (state) => {
        state.status = "loading";
      })
      .addCase(createKtpFromTup.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.plan = action.payload.plan;
        state.sourceTupName = action.payload.name;
        state.className = action.payload.className;
        state.savedKtps.push(action.payload);
      })
      .addCase(createKtpFromTup.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const {
  setClassName,
  updateLesson,
  addHour,
  deleteLesson,
  reorderPlan,
  mergeObjectives,
  splitAllObjectives,
  addSor,
  autofillDates,
  clearAutofillError,
  setTotalHours,
  setQuarterWorkHours,
  saveKtpToLocalStorage,
  loadKtpsFromLocalStorage,
  setKtpForEditing,
  updateKtpName,
  deleteKtp,
  resetKtpEditor,
} = ktpEditorSlice.actions;

export const ktpEditorReducer = ktpEditorSlice.reducer;

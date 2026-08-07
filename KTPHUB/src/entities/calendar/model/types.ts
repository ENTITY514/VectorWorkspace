// src/entities/calendar/model/types.ts

export interface QuarterDates {
  start: string;
  end: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  isTransfer?: boolean;
}

export interface DateRangeHoliday {
  id: string;
  start: string;
  end: string;
  name: string;
}

export interface CalendarProfile {
  id: string;
  name: string;
  quarters: {
    q1: QuarterDates;
    q2: QuarterDates;
    q3: QuarterDates;
    q4: QuarterDates;
  };
  additionalHolidays: DateRangeHoliday[];
}

export interface CalendarState {
  profiles: CalendarProfile[];
  activeProfileId: string | null;
  holidays: Holiday[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

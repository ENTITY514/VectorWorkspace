// src/shared/services/kzCalendarService.ts

export interface KzHolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
  isTransfer?: boolean;
}

const formatYYYYMMDD = (year: number, month: number, day: number): string => {
  const m = month.toString().padStart(2, "0");
  const d = day.toString().padStart(2, "0");
  return `${year}-${m}-${d}`;
};

export const getKzProductionCalendar = (year: number): KzHolidayItem[] => {
  const baseHolidays: Array<{ month: number; day: number; name: string }> = [
    { month: 1, day: 1, name: "Новый год (Жаңа жыл)" },
    { month: 1, day: 2, name: "Новый год (Жаңа жыл)" },
    { month: 1, day: 7, name: "Православное Рождество" },
    { month: 3, day: 8, name: "Международный женский день" },
    { month: 3, day: 21, name: "Наурыз мейрамы" },
    { month: 3, day: 22, name: "Наурыз мейрамы" },
    { month: 3, day: 23, name: "Наурыз мейрамы" },
    { month: 5, day: 1, name: "Праздник единства народа Казахстана" },
    { month: 5, day: 7, name: "День защитника Отечества" },
    { month: 5, day: 9, name: "День Победы" },
    { month: 7, day: 6, name: "День Столицы" },
    { month: 8, day: 30, name: "День Конституции РК" },
    { month: 10, day: 25, name: "День Республики" },
    { month: 12, day: 16, name: "День Независимости" },
  ];

  const result: KzHolidayItem[] = [];
  const occupiedDates = new Set<string>();

  // First pass: add exact holiday dates
  baseHolidays.forEach((h) => {
    const dateStr = formatYYYYMMDD(year, h.month, h.day);
    result.push({ date: dateStr, name: h.name });
    occupiedDates.add(dateStr);
  });

  // Second pass: apply Kazakhstan Labor Code Art. 85 auto-transfer rule
  baseHolidays.forEach((h) => {
    // Religious holidays (7 Jan) don't transfer per KZ Labor Code
    if (h.month === 1 && h.day === 7) return;

    const dateObj = new Date(year, h.month - 1, h.day);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat

    if (dayOfWeek === 6 || dayOfWeek === 0) {
      // Find next available non-weekend working day
      let transferDate = new Date(dateObj);
      let offset = dayOfWeek === 6 ? 2 : 1; // Move to Monday
      transferDate.setDate(transferDate.getDate() + offset);

      while (
        transferDate.getDay() === 0 ||
        transferDate.getDay() === 6 ||
        occupiedDates.has(
          formatYYYYMMDD(
            transferDate.getFullYear(),
            transferDate.getMonth() + 1,
            transferDate.getDate()
          )
        )
      ) {
        transferDate.setDate(transferDate.getDate() + 1);
      }

      const transferStr = formatYYYYMMDD(
        transferDate.getFullYear(),
        transferDate.getMonth() + 1,
        transferDate.getDate()
      )
      result.push({
        date: transferStr,
        name: `Перенос выходного: ${h.name}`,
        isTransfer: true,
      });
      occupiedDates.add(transferStr);
    }
  });

  // Sort chronologically
  result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return result;
};

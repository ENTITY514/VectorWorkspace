// src/shared/services/kzCalendarService.test.ts
// Тесты производственного календаря РК (Фаза 4, FR-2.4: сдвиг дат).

import { getKzProductionCalendar, KzHolidayItem } from "./kzCalendarService";

const byDate = (items: KzHolidayItem[], date: string) =>
  items.find((i) => i.date === date);

describe("getKzProductionCalendar", () => {
  test("содержит все официальные праздники года", () => {
    const items = getKzProductionCalendar(2026);
    const expected = [
      "2026-01-01",
      "2026-01-02",
      "2026-01-07",
      "2026-03-08",
      "2026-03-21",
      "2026-03-22",
      "2026-03-23",
      "2026-05-01",
      "2026-05-07",
      "2026-05-09",
      "2026-07-06",
      "2026-08-30",
      "2026-10-25",
      "2026-12-16",
    ];
    for (const date of expected) {
      expect(byDate(items, date)).toBeDefined();
    }
  });

  test("переносит праздник, выпавший на выходной, на следующий будний день", () => {
    // 2026-10-25 — воскресенье → перенос на понедельник 2026-10-26.
    const items = getKzProductionCalendar(2026);
    const transfer = byDate(items, "2026-10-26");
    expect(transfer).toBeDefined();
    expect(transfer!.isTransfer).toBe(true);
  });

  test("не переносит Рождество (7 января) — религиозный праздник", () => {
    const items = getKzProductionCalendar(2026);
    // 2026-01-07 — среда, перенос не нужен и не должен добавляться для 7 янв.
    const transfers = items.filter(
      (i) => i.isTransfer && i.name.includes("Рождество")
    );
    expect(transfers).toHaveLength(0);
  });

  test("результат отсортирован по датам", () => {
    const items = getKzProductionCalendar(2026);
    for (let i = 1; i < items.length; i++) {
      expect(
        new Date(items[i - 1].date).getTime() <= new Date(items[i].date).getTime()
      ).toBe(true);
    }
  });

  test("не содержит дублей дат", () => {
    const items = getKzProductionCalendar(2026);
    const dates = new Set(items.map((i) => i.date));
    expect(dates.size).toBe(items.length);
  });
});
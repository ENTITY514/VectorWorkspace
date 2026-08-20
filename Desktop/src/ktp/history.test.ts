import { describe, expect, it } from "vitest";
import { HistoryMachine } from "./history";

describe("HistoryMachine detailed tests", () => {
  it("сохраняет и восстанавливает оригинальные названия меток при undo/redo", () => {
    const h = new HistoryMachine<string>("initial");
    h.commit("v1", "Добавить СОР");
    h.commit("v2", "Удалить урок");

    expect(h.labels.map((l) => l.label)).toEqual(["Добавить СОР", "Удалить урок"]);

    expect(h.undo()).toBe("v1");
    expect(h.labels.map((l) => l.label)).toEqual(["Добавить СОР"]);

    expect(h.redo()).toBe("v2");
    expect(h.labels.map((l) => l.label)).toEqual(["Добавить СОР", "Удалить урок"]);
  });

  it("очищает futureLabels при выполнении нового действия после undo", () => {
    const h = new HistoryMachine<number>(0);
    h.commit(1, "шаг 1");
    h.commit(2, "шаг 2");
    h.undo();

    h.commit(3, "шаг 3 (ветвление)");
    expect(h.canRedo).toBe(false);
    expect(h.labels.map((l) => l.label)).toEqual(["шаг 1", "шаг 3 (ветвление)"]);
  });

  it("соблюдает ограничение емкости стеков (cap)", () => {
    const h = new HistoryMachine<number>(0, 3);
    h.commit(1, "1");
    h.commit(2, "2");
    h.commit(3, "3");
    h.commit(4, "4");

    expect(h.past.length).toBe(3);
    expect(h.labels.length).toBe(3);
    expect(h.labels.map((l) => l.label)).toEqual(["2", "3", "4"]);
  });
});

import { describe, expect, it } from "vitest";
import { matchSourceDoc, sourceDocLabel } from "./sourceDoc";
import type { TupDocumentListItem } from "../types";

// Эталонный реестр «предмет × класс → приказ/приложение» из Materials/test_ru.json
// (алгебра). Записываем точные значения из файла, чтобы тест покрывал реальный реестр.
const FIXTURE: TupDocumentListItem[] = [
  {
    id: "algebra-7-9",
    subjectId: "algebra",
    subjectName: "Алгебра",
    targetGrades: "7-9",
    directionStr: "common",
    appendixNumber: 53,
    orderNumber: "399",
    orderDate: "2022-09-16",
    objectiveCount: 0,
    hasDsp: true,
    language: "RU",
  },
  {
    id: "algebra-analysis-emn-10-11",
    subjectId: "algebra_analysis",
    subjectName: "Алгебра и начала анализа",
    targetGrades: "10-11",
    directionStr: "ЕМН",
    appendixNumber: 104,
    orderNumber: "399",
    orderDate: "2022-09-16",
    objectiveCount: 0,
    hasDsp: true,
    language: "RU",
  },
  {
    id: "algebra-analysis-ogn-10-11",
    subjectId: "algebra_analysis",
    subjectName: "Алгебра и начала анализа",
    targetGrades: "10-11",
    directionStr: "ОГН",
    appendixNumber: 105,
    orderNumber: "399",
    orderDate: "2022-09-16",
    objectiveCount: 0,
    hasDsp: true,
    language: "RU",
  },
];

describe("matchSourceDoc (A1: реестр предмет × класс → приложение)", () => {
  it("для алгебры 10 класса подставляется приложение из test_ru.json, не общее", () => {
    const doc = matchSourceDoc(FIXTURE, "algebra_analysis", 10, "RU");
    expect(doc).not.toBeNull();
    expect([104, 105]).toContain(doc!.appendixNumber);
    expect(doc!.appendixNumber).not.toBe(53); // не подставляем «алгебру 7-9»
  });

  it("для алгебры (7-9) класс 10 не покрыт → null, без подмены", () => {
    expect(matchSourceDoc(FIXTURE, "algebra", 10, "RU")).toBeNull();
    expect(matchSourceDoc(FIXTURE, "algebra", 8, "RU")?.appendixNumber).toBe(53);
  });

  it("несуществующий предмет → null", () => {
    expect(matchSourceDoc(FIXTURE, "unknown_subject", 10)).toBeNull();
  });

  it("язык уточняет выбор", () => {
    const ru = matchSourceDoc(FIXTURE, "algebra_analysis", 10, "RU");
    const kk = matchSourceDoc(FIXTURE, "algebra_analysis", 10, "KK");
    expect(ru?.language).toBe("RU");
    // KK-документа нет — фолбэк на RU-вариант.
    expect(kk?.language).toBe("RU");
  });
});

describe("sourceDocLabel (A1)", () => {
  it("формирует строку приказ/дата/номер/приложение", () => {
    expect(sourceDocLabel(FIXTURE[0])).toBe("Источник: приказ МОН РК от 2022-09-16 № 399 · приложение 53");
  });
});
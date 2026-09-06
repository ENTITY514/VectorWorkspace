import { describe, expect, it } from "vitest";
import { directionLabel, isKazakh, languageLabel, normalizeDirection } from "./labels";

describe("isKazakh", () => {
  it("принимает KK/kz/kk — так язык лежит в базе после приказа 399", () => {
    expect(isKazakh("KK")).toBe(true);
    expect(isKazakh("kz")).toBe(true);
    expect(isKazakh("RU")).toBe(false);
  });
});

describe("directionLabel", () => {
  it("понимает и сырой код, и уже подписанный бейдж", () => {
    expect(directionLabel("emn")).toBe("ЕМН");
    expect(directionLabel("ЕМН")).toBe("ЕМН");
    expect(directionLabel("common")).toBe("Общеобразовательная");
  });
});

describe("languageLabel", () => {
  it("не зависит от регистра", () => {
    expect(languageLabel("RU")).toBe("Русский");
    expect(languageLabel("KK")).toBe("Казахский");
  });
});

describe("normalizeDirection", () => {
  it("не путает общеобразовательную с ОГН", () => {
    expect(normalizeDirection("Общеобразовательная")).toBe("common");
    expect(normalizeDirection("общественно-гуманитарное")).toBe("ogn");
  });
});

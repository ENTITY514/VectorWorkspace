// Ссылки на нормативный документ adilet: приказ МОН РК № 399 от 16.09.2022,
// документ V2200029767. Приложение N открывается по якорю #z{146+N}
// (1-қосымша → #z147, 5-қосымша → #z151, 26-қосымша → #z172 и т.д.).
const ADILET_DOC_ID = "V2200029767";
const ADILET_ANCHOR_BASE = 146;

export function adiletDocUrl(language: string): string {
  const slug = language.toUpperCase() === "RU" ? "rus" : "kaz";
  return `https://adilet.zan.kz/${slug}/docs/${ADILET_DOC_ID}`;
}

export function adiletAppendixUrl(language: string, appendixNumber: number): string {
  if (!appendixNumber || appendixNumber <= 0) return adiletDocUrl(language);
  return `${adiletDocUrl(language)}#z${ADILET_ANCHOR_BASE + appendixNumber}`;
}

export function appendixLabel(appendixNumber: number): string {
  return `приложение ${appendixNumber}`;
}
/* Понятные учителю подписи для экранов ТУП.
 * Единый источник истины: сырые технические/английские значения
 * (common/emn/ogn, ru/kz, objective/section/topic/task) нигде не
 * показываются пользователю напрямую. */

export function directionLabel(d: string): string {
  switch (d) {
    case "emn":
      return "ЕМН";
    case "ogn":
      return "ОГН";
    case "common":
      return "Общеобразовательная";
    default:
      return d;
  }
}

export function directionFull(d: string): string {
  switch (d) {
    case "emn":
      return "Естественно-математическое направление";
    case "ogn":
      return "Общественно-гуманитарное направление";
    case "common":
      return "Общеобразовательная программа";
    default:
      return d;
  }
}

export function languageLabel(l: string): string {
  const v = (l || "").toLowerCase();
  if (v === "ru") return "Русский";
  if (v === "kz" || v === "kk") return "Казахский";
  return (l || "").toUpperCase() || "—";
}

export function entityTypeLabel(e: string): string {
  switch (e) {
    case "objective":
      return "Цель";
    case "section":
      return "Раздел";
    case "topic":
      return "Тема";
    case "task":
      return "Задание";
    default:
      return e;
  }
}

/** Нормализует сырое направление или уже подписанный бейдж. */
export function normalizeDirection(d: string): "emn" | "ogn" | "common" {
  const v = (d || "").trim().toLowerCase();
  if (v === "emn" || v === "емн" || v.includes("естественно")) return "emn";
  if (v === "ogn" || v === "огн" || v.includes("общественно") || v.includes("гуманитар")) return "ogn";
  return "common";
}

/** Почему у одного предмета два приложения: ЕМН и ОГН — разные профили. */
export function directionWhy(d: string): string {
  switch (normalizeDirection(d)) {
    case "emn":
      return "ЕМН — естественно-математическое направление";
    case "ogn":
      return "ОГН — общественно-гуманитарное направление";
    default:
      return "Общеобразовательная программа";
  }
}

/** Подпись варианта ТУП в списках и селекте КТП. */
export function documentChoiceLabel(doc: {
  appendixNumber: number;
  targetGrades: string;
  language: string;
  directionStr: string;
}): string {
  const dir = normalizeDirection(doc.directionStr);
  const variant = dir === "emn" ? "ЕМН" : dir === "ogn" ? "ОГН" : "";
  const parts = [`Прил. ${doc.appendixNumber}`];
  if (variant) parts.push(variant);
  parts.push(doc.targetGrades);
  if (doc.language) parts.push(doc.language.toUpperCase());
  return parts.join(" · ");
}

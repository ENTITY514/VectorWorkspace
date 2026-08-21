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

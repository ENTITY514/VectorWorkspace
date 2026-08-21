import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

/* Управляет темой приложения: ставит data-theme на <html> и сохраняет
 * выбор в localStorage (vw-theme). Переиспользуется заголовком и сайдбаром. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("vw-theme");
    if (saved === "light" || saved === "dark") return saved;
    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("vw-theme", theme);
  }, [theme]);

  return [theme, setTheme];
}

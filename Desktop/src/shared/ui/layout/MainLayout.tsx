import React, { useEffect, useState } from "react";
import type { View } from "../../../types";
import { Sidebar } from "./Sidebar";
import { AppHeader } from "./AppHeader";

const titles: Record<View, string> = {
  today: "Сегодня",
  tup: "Нормативный базис — ТУП",
  ktp: "Календарно-тематический план",
  lessons: "Уроки — КСП",
  library: "Библиотека заданий",
  sor: "СОР / СОЧ",
  analytics: "Аналитика",
  students: "Ученики",
  settings: "Настройки школы",
  ds: "Дизайн (тест)",
};

const subtitles: Partial<Record<View, string>> = {
  today: "Рабочий стол учителя математики",
  tup: "Типовые учебные программы · документы и цели обучения",
  lessons: "Краткосрочные планы в форме 130 приказа",
  library: "Задания из учебников, связанные с ЦО",
  sor: "Суммативное оценивание и диагностика",
  analytics: "Анализ результатов и слабых ЦО",
  students: "Индивидуальные листы отработки",
  settings: "Школа · штат · профиль · классы",
  ds: "Песочница Design System — оценка токенов и компонентов",
};

export function MainLayout({
  view,
  onViewChange,
  children,
}: {
  view: View;
  onViewChange: (v: View) => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem("vw-sidebar-collapsed") === "1",
  );

  useEffect(() => {
    localStorage.setItem("vw-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="app">
      <Sidebar
        view={view}
        onSelect={onViewChange}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main className="main">
        <AppHeader
          title={titles[view]}
          subtitle={subtitles[view]}
          onNavigate={onViewChange}
        />
        <div className="main-content">{children}</div>
      </main>
    </div>
  );
}

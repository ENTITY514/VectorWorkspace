import React from "react";
import type { View } from "../../../types";
import { Sidebar } from "./Sidebar";

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
  return (
    <div className="app">
      <Sidebar view={view} onSelect={onViewChange} />
      <main className="main">
        <div className="page-head">
          <h1>{titles[view]}</h1>
          <p>{subtitles[view]}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

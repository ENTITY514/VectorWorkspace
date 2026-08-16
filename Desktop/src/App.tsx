import { useState } from "react";
import type { View } from "./types";
import "./styles.css";
import { Today } from "./panels/Today";
import { Tup } from "./panels/Tup";
import { Ktp } from "./panels/Ktp";
import { Lessons } from "./panels/Lessons";
import { Library } from "./panels/Library";
import { Sor } from "./panels/Sor";
import { Analytics } from "./panels/Analytics";
import { Students } from "./panels/Students";

const nav: { id: View; icon: string; label: string }[] = [
  { id: "today", icon: "◧", label: "Сегодня" },
  { id: "tup", icon: "◫", label: "ТУП" },
  { id: "ktp", icon: "▤", label: "КТП" },
  { id: "lessons", icon: "✎", label: "Уроки (КСП)" },
  { id: "library", icon: "☰", label: "Библиотека заданий" },
  { id: "sor", icon: "✓", label: "СОР / СОЧ" },
  { id: "analytics", icon: "◔", label: "Аналитика" },
  { id: "students", icon: "☺", label: "Ученики" },
];

const titles: Record<View, string> = {
  today: "Сегодня",
  tup: "Нормативный базис — ТУП",
  ktp: "Календарно-тематический план",
  lessons: "Уроки — КСП",
  library: "Библиотека заданий",
  sor: "СОР / СОЧ",
  analytics: "Аналитика",
  students: "Ученики",
};

const subtitles: Partial<Record<View, string>> = {
  today: "Рабочий стол учителя математики",
  tup: "Типовые учебные программы · документы и цели обучения",
  ktp: "По приказу МОН РК № 130 · 8–10 классы",
  lessons: "Краткосрочные планы в форме 130 приказа",
  library: "Задания из учебников, связанные с ЦО",
  sor: "Суммативное оценивание и диагностика",
  analytics: "Анализ результатов и слабых ЦО",
  students: "Индивидуальные листы отработки",
};

function App() {
  const [view, setView] = useState<View>("today");

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>VectorWorkspace</h1>
          <p>Учитель математики · КСП/СОР</p>
        </div>
        <nav className="sidebar-nav">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => setView(n.id)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">Локально · вектор рабочего пространства</div>
      </aside>

      <main className="main">
        <div className="page-head">
          <h1>{titles[view]}</h1>
          <p>{subtitles[view]}</p>
        </div>
        {view === "today" && <Today />}
        {view === "tup" && <Tup />}
        {view === "ktp" && <Ktp />}
        {view === "lessons" && <Lessons />}
        {view === "library" && <Library />}
        {view === "sor" && <Sor />}
        {view === "analytics" && <Analytics />}
        {view === "students" && <Students />}
      </main>
    </div>
  );
}

export default App;

import { useEffect, useState } from "react";
import type { SchoolState, View } from "./types";
import "./styles.css";
import { Today } from "./panels/Today";
import { TupList } from "./panels/TupList";
import { TupDetail } from "./panels/TupDetail";
import { KtpEditor } from "./panels/KtpEditor";
import { KtpList } from "./panels/KtpList";
import { Lessons } from "./panels/Lessons";
import { Library } from "./panels/Library";
import { Sor } from "./panels/Sor";
import { Analytics } from "./panels/Analytics";
import { Students } from "./panels/Students";
import { Settings } from "./panels/Settings";
import { Onboarding } from "./panels/Onboarding";
import { api } from "./api";

const nav: { id: View; icon: string; label: string }[] = [
  { id: "today", icon: "◧", label: "Сегодня" },
  { id: "tup", icon: "◫", label: "ТУП" },
  { id: "ktp", icon: "▤", label: "КТП" },
  { id: "lessons", icon: "✎", label: "Уроки (КСП)" },
  { id: "library", icon: "☰", label: "Библиотека заданий" },
  { id: "sor", icon: "✓", label: "СОР / СОЧ" },
  { id: "analytics", icon: "◔", label: "Аналитика" },
  { id: "students", icon: "☺", label: "Ученики" },
  { id: "settings", icon: "⚙", label: "Настройки" },
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

function App() {
  const [view, setView] = useState<View>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getSchoolState()
      .then((s: SchoolState) => setOnboarded(s.onboarded))
      .catch(() => setOnboarded(true));
  }, []);

  if (onboarded === null) {
    return <div className="empty" style={{ margin: 40 }}>Проверка состояния учреждения...</div>;
  }

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

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
              onClick={() => {
                setView(n.id);
                setSelectedId(null);
              }}
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
        {view === "tup" && (
          selectedId ? (
            <TupDetail id={selectedId} onClose={() => setSelectedId(null)} />
          ) : (
            <TupList onSelect={(id) => setSelectedId(id)} />
          )
        )}
        {view === "ktp" && (
          selectedId ? (
            <KtpEditor planId={selectedId} onClose={() => setSelectedId(null)} />
          ) : (
            <KtpList onOpen={(id) => setSelectedId(id)} />
          )
        )}
        {view === "lessons" && <Lessons />}
        {view === "library" && <Library />}
        {view === "sor" && <Sor />}
        {view === "analytics" && <Analytics />}
        {view === "students" && <Students />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default App;

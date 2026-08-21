import { useEffect, useState } from "react";
import type { SchoolState, View } from "./types";
import "./styles.css";
import { Today } from "./panels/Today";
import { TupList } from "./domains/tup/ui/TupList";
import { TupDetail } from "./domains/tup/ui/TupDetail";
import { KtpEditor } from "./panels/KtpEditor";
import { KtpList } from "./domains/ktp/ui/KtpList";
import { Lessons } from "./panels/Lessons";
import { Library } from "./panels/Library";
import { Sor } from "./panels/Sor";
import { Analytics } from "./panels/Analytics";
import { Students } from "./panels/Students";
import { Settings } from "./panels/Settings";
import { Onboarding } from "./panels/Onboarding";
import { api } from "./services/api";
import { DesignSandbox } from "./DesignSandbox";
import { MainLayout } from "./shared/ui/layout/MainLayout";
import { Titlebar } from "./shared/ui/layout/Titlebar";

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
    return (
      <div className="app-shell">
        <Titlebar />
        <Onboarding onDone={() => setOnboarded(true)} />
      </div>
    );
  }

  const handleViewChange = (v: View) => {
    setView(v);
    setSelectedId(null);
  };

  return (
    <div className="app-shell">
      <Titlebar />
      <MainLayout view={view} onViewChange={handleViewChange}>
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
        {view === "ds" && <DesignSandbox />}
      </MainLayout>
    </div>
  );
}

export default App;

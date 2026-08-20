import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { SchoolState } from "../types";
import { SchoolSection } from "./settings/SchoolSection";
import { StaffSection } from "./settings/StaffSection";
import { ProfileSection } from "./settings/ProfileSection";
import { ClassesSection } from "./settings/ClassesSection";
import { BackupSection } from "./settings/BackupSection";

export function Settings() {
  const [state, setState] = useState<SchoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await api.getSchoolState());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty">Загрузка настроек школы...</div>;
  if (error) return <div className="flash-error">{error}</div>;
  if (!state?.school) {
    return <div className="empty">Школа не создана. Пройдите онбординг.</div>;
  }

  return (
    <div className="settings">
      <SchoolSection
        id={state.school.id}
        name={state.school.name}
        region={state.school.region}
        onSaved={load}
      />
      <StaffSection schoolId={state.school.id} staff={state.staff} onSaved={load} />
      <ProfileSection
        fullName={state.profile?.fullName ?? ""}
        category={state.profile?.category ?? ""}
        onSaved={load}
      />
      <ClassesSection schoolId={state.school.id} classes={state.classes} onSaved={load} />
      <BackupSection />
    </div>
  );
}

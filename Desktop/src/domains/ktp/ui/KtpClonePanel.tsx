import { SUBJECT_NAMES } from "../../../panels/SubjectNames";

export function KtpClonePanel({ hook }: { hook: any }) {
  const {
    templates, selectedTemplateId, setSelectedTemplateId, cloneGrade, setCloneGrade, cloneBusy, cloneFromTemplate
  } = hook;

  if (templates.length === 0) return null;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>Создать из шаблона (на параллельный класс)</h3>
      </div>
      <div className="panel-body">
        <div className="filter-row">
          <select
            className="filter-select"
            style={{ minWidth: 260 }}
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            <option value="">Шаблон…</option>
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name} · {SUBJECT_NAMES[t.subjectId] ?? t.subjectId} · {t.grade} класс · {t.language}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            style={{ minWidth: 110 }}
            value={cloneGrade ?? ""}
            onChange={(e) => setCloneGrade(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Класс…</option>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((g) => (
              <option key={g} value={g}>{g} класс</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            disabled={cloneBusy || !selectedTemplateId || cloneGrade == null}
            onClick={cloneFromTemplate}
          >
            {cloneBusy ? "…" : "Создать и открыть"}
          </button>
        </div>
      </div>
    </div>
  );
}

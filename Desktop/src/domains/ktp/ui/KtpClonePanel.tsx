import { subjectName } from "../../../panels/SubjectNames";
import { languageLabel } from "../../tup/labels";
import { academicYearOptions, type KtpListHook } from "../useKtpList";

export function KtpClonePanel({ hook }: { hook: KtpListHook }) {
  const {
    templates, selectedTemplateId, setSelectedTemplateId, cloneGrade, setCloneGrade,
    cloneBusy, cloneFromTemplate, removeTemplate, academicYear, setAcademicYear,
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
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {subjectName(t.subjectId, t.language)} · {t.grade} класс · {languageLabel(t.language)}
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
            {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>{g} класс</option>
            ))}
          </select>
          <select
            className="filter-select"
            style={{ minWidth: 130 }}
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          >
            {academicYearOptions(academicYear).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            disabled={cloneBusy || !selectedTemplateId || cloneGrade == null}
            onClick={cloneFromTemplate}
          >
            {cloneBusy ? "…" : "Создать и открыть"}
          </button>
          {selectedTemplateId && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (window.confirm("Удалить этот шаблон? Сохранённые планы не затронутся.")) {
                  removeTemplate(selectedTemplateId);
                }
              }}
            >
              Удалить шаблон
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { openUrl } from "@tauri-apps/plugin-opener";
import { adiletAppendixUrl, appendixLabel } from "../../../lib/adilet";
import { WEEKDAYS } from "../useKtpList";

export function KtpCreatePanel({ hook }: { hook: any }) {
  const {
    subjects, selectedSubject, setSelectedSubject, setSelectedLanguage, setSelectedGrade, setSelectedDocId,
    languages, selectedLanguage, gradeOptions, selectedGrade, candidateDocs, selectedDocId,
    daysOfWeek, setDaysOfWeek, busy, canGenerate, selectedDoc, setPendingDoc
  } = hook;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>Создать новый КТП</h3>
      </div>
      <div className="panel-body">
        <div className="filter-row">
          <select
            className="filter-select"
            style={{ minWidth: 190 }}
            value={selectedSubject}
            onChange={(e) => {
              setSelectedSubject(e.target.value);
              setSelectedLanguage("");
              setSelectedGrade(null);
              setSelectedDocId("");
            }}
          >
            <option value="">Предмет…</option>
            {subjects.map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            className="filter-select"
            style={{ minWidth: 110 }}
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value);
              setSelectedGrade(null);
              setSelectedDocId("");
            }}
          >
            <option value="">Язык…</option>
            {languages.map((l: string) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>

          <select
            className="filter-select"
            style={{ minWidth: 105 }}
            value={selectedGrade ?? ""}
            onChange={(e) => {
              setSelectedGrade(e.target.value ? Number(e.target.value) : null);
              setSelectedDocId("");
            }}
          >
            <option value="">Класс…</option>
            {gradeOptions.map((g: number) => <option key={g} value={g}>{g} класс</option>)}
          </select>

          <select
            className="filter-select"
            style={{ minWidth: 215 }}
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            <option value="">Документ ТУП…</option>
            {candidateDocs.map((d: any) => (
              <option key={d.id} value={d.id}>
                Прил. {d.appendixNumber} · {d.targetGrades} · {d.language.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-row" style={{ marginTop: 10 }}>
          <span>Дни недели:</span>
          {WEEKDAYS.map((w) => (
            <label key={w.num} className="ktp-day">
              <input
                type="checkbox"
                checked={daysOfWeek.includes(w.num)}
                onChange={() =>
                  setDaysOfWeek((prev: number[]) =>
                    prev.includes(w.num) ? prev.filter((n) => n !== w.num) : [...prev, w.num].sort()
                  )
                }
              />
              {w.label}
            </label>
          ))}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => selectedDoc && setPendingDoc(selectedDoc)}
            disabled={busy || !canGenerate}
          >
            {busy ? "…" : "Сгенерировать и открыть"}
          </button>
        </div>
        {selectedDoc && (
          <div className="ktp-source-note">
            Источник: приказ МОН РК от {selectedDoc.orderDate} № {selectedDoc.orderNumber} ·{" "}
            {appendixLabel(selectedDoc.appendixNumber)} ·{" "}
            <a
              className="ktp-source-link"
              onClick={() => openUrl(adiletAppendixUrl(selectedDoc.language, selectedDoc.appendixNumber))}
            >
              открыть оригинал
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

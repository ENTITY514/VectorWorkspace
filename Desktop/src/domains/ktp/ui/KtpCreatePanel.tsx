import { openUrl } from "@tauri-apps/plugin-opener";
import { adiletAppendixUrl, appendixLabel } from "../../../lib/adilet";
import {
  STATUS_LABEL,
  WEEKDAYS,
  YEAR_WEEKS,
  academicYearOptions,
  type KtpListHook,
} from "../useKtpList";
import { directionWhy, documentChoiceLabel, languageLabel } from "../../tup/labels";
import { subjectName } from "../../../panels/SubjectNames";

export function KtpCreatePanel({ hook }: { hook: KtpListHook }) {
  const {
    subjects, selectedSubject, setSelectedSubject, setSelectedLanguage, setSelectedGrade, setSelectedDocId,
    languages, selectedLanguage, gradeOptions, selectedGrade, candidateDocs, selectedDocId,
    daysOfWeek, setDaysOfWeek, academicYear, setAcademicYear,
    busy, canGenerate, selectedDoc, setPendingDoc,
    hoursPerWeek, expectedHours, duplicates, openPlan,
  } = hook;

  const dayHint =
    hoursPerWeek != null && daysOfWeek.length !== hoursPerWeek
      ? daysOfWeek.length < hoursPerWeek
        ? `В ТУП ${hoursPerWeek} ч/нед, выбрано ${daysOfWeek.length} дн. — часть уроков будет сдвоенной.`
        : `Выбрано ${daysOfWeek.length} дн. при ${hoursPerWeek} ч/нед в ТУП — лишние дни останутся без урока.`
      : null;

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
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
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
            {languages.map((l) => <option key={l} value={l}>{languageLabel(l)}</option>)}
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
            {gradeOptions.map((g) => <option key={g} value={g}>{g} класс</option>)}
          </select>

          <select
            className="filter-select"
            style={{ minWidth: 215 }}
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            <option value="">Документ ТУП…</option>
            {candidateDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {documentChoiceLabel(d)}
              </option>
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
        </div>
        <div className="filter-row" style={{ marginTop: 10 }}>
          <span>Дни недели:</span>
          {WEEKDAYS.map((w) => (
            <label key={w.num} className="ktp-day">
              <input
                type="checkbox"
                checked={daysOfWeek.includes(w.num)}
                onChange={() =>
                  setDaysOfWeek((prev) =>
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
        {expectedHours != null && hoursPerWeek != null && (
          <div className="ktp-hint">
            Норма ТУП: {hoursPerWeek} ч/нед × {YEAR_WEEKS} нед. = <strong>{expectedHours} ч.</strong> за год
            {selectedGrade != null ? ` · ${selectedGrade} класс` : ""}.
          </div>
        )}
        {dayHint && <div className="ktp-hint ktp-hint-warn">{dayHint}</div>}
        {duplicates.length > 0 && (
          <div className="ktp-hint ktp-hint-warn">
            Уже есть {duplicates.length}{" "}
            {duplicates.length === 1 ? "план" : "плана"}{" "}
            {selectedDoc ? subjectName(selectedDoc.subjectId, selectedDoc.language) : ""}{" "}
            {selectedGrade} кл. за {academicYear}. Можно открыть существующий или создать ещё.
            <div className="row gap-sm" style={{ marginTop: 8 }}>
              {duplicates.map((p) => (
                <button key={p.id} className="btn btn-sm" onClick={() => openPlan(p.id)}>
                  Открыть · {p.totalHours} ч. · {STATUS_LABEL[p.status] ?? p.status}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedDoc && (
          <div className="ktp-source-note">
            Источник: приказ МОН РК от {selectedDoc.orderDate} № {selectedDoc.orderNumber} ·{" "}
            {appendixLabel(selectedDoc.appendixNumber)} · {directionWhy(selectedDoc.directionStr)} ·{" "}
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

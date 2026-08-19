import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import { Panel } from "../components/ui";
import type { KtpPlanCard, TupDocumentListItem } from "../types";
import { SUBJECT_NAMES } from "./SubjectNames";
import { parseGrades } from "../lib/grades";
import { adiletAppendixUrl, appendixLabel } from "../lib/adilet";

const WEEKDAYS = [
  { num: 1, label: "Пн" },
  { num: 2, label: "Вт" },
  { num: 3, label: "Ср" },
  { num: 4, label: "Чт" },
  { num: 5, label: "Пт" },
  { num: 6, label: "Сб" },
];

const STATUS_LABEL: Record<string, string> = {
  Draft: "Черновик",
  Validating: "На проверке",
  Approved: "Утверждён",
  Archived: "Архив",
};

function statusTone(status: string): string {
  switch (status) {
    case "Approved":
      return "green";
    case "Validating":
      return "amber";
    case "Archived":
      return "gray";
    default:
      return "blue";
  }
}

export function KtpList({ onOpen }: { onOpen: (id: string) => void }) {
  const [documents, setDocuments] = useState<TupDocumentListItem[]>([]);
  const [savedPlans, setSavedPlans] = useState<KtpPlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([2, 4]);
  const [pendingDoc, setPendingDoc] = useState<TupDocumentListItem | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [docs, plans] = await Promise.all([api.fetchTupDocuments(), api.listKtpPlans()]);
      setDocuments(docs);
      setSavedPlans(plans);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) if (d.subjectName) set.add(d.subjectName);
    return Array.from(set).sort();
  }, [documents]);

  const languages = useMemo(() => {
    if (!selectedSubject) return [];
    const set = new Set<string>();
    for (const d of documents) if (d.subjectName === selectedSubject && d.language) set.add(d.language);
    return Array.from(set).sort();
  }, [documents, selectedSubject]);

  const gradeOptions = useMemo(() => {
    if (!selectedSubject || !selectedLanguage) return [];
    const set = new Set<number>();
    for (const d of documents) {
      if (d.subjectName === selectedSubject && d.language === selectedLanguage) {
        for (const g of parseGrades(d.targetGrades)) set.add(g);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [documents, selectedSubject, selectedLanguage]);

  const candidateDocs = useMemo(() => {
    if (!selectedSubject || !selectedLanguage || selectedGrade == null) return [];
    return documents.filter((d) => {
      if (d.subjectName !== selectedSubject || d.language !== selectedLanguage) return false;
      return parseGrades(d.targetGrades).includes(selectedGrade);
    });
  }, [documents, selectedSubject, selectedLanguage, selectedGrade]);

  const canGenerate = Boolean(selectedDocId) && selectedGrade != null && daysOfWeek.length > 0;

  const generate = async (docId: string) => {
    if (selectedGrade == null || daysOfWeek.length === 0) return;
    setBusy(true);
    setError("");
    setStatus("Генерация плана из ТУП…");
    try {
      const plan = await api.generateKtpFromTup(docId, selectedGrade!, "2026-2027", 2026, daysOfWeek);
      setStatus(`План сохранён: ${plan.totalHours} уроков.`);
      setPendingDoc(null);
      onOpen(plan.id);
    } catch (e) {
      setError(String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? null;

  const subjectName = (subjectId: string) => SUBJECT_NAMES[subjectId] ?? subjectId;
  const languageName = (lang: string) => (lang === "KK" ? "Қазақша" : lang === "RU" ? "Русский" : lang || "—");

  return (
    <Panel title="КТП" subtitle="Список планов: класс, язык, предмет, учебный год">
      <div className="panel-body">
        {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}
        {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}
        {loading && <div className="empty">Загрузка…</div>}
        {!loading && (
          <>
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
                    {subjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
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
                    {languages.map((l) => (
                      <option key={l} value={l}>{l.toUpperCase()}</option>
                    ))}
                  </select>

                  <select
                    className="filter-select"
                    style={{ minWidth: 105 }}
                    value={selectedGrade ?? ""}
                    onChange={(e) => {
                      const g = e.target.value ? Number(e.target.value) : null;
                      setSelectedGrade(g);
                      setSelectedDocId("");
                    }}
                  >
                    <option value="">Класс…</option>
                    {gradeOptions.map((g) => (
                      <option key={g} value={g}>{g} класс</option>
                    ))}
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
                          setDaysOfWeek((prev) =>
                            prev.includes(w.num) ? prev.filter((n) => n !== w.num) : [...prev, w.num].sort(),
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
                      onClick={() =>
                        openUrl(adiletAppendixUrl(selectedDoc.language, selectedDoc.appendixNumber))
                      }
                    >
                      открыть оригинал
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3 style={{ margin: 0 }}>Сохранённые планы ({savedPlans.length})</h3>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                {savedPlans.length === 0 ? (
                  <div className="empty" style={{ padding: 24 }}>
                    Планов пока нет — создайте первый КТП из документа ТУП.
                  </div>
                ) : (
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Предмет</th>
                        <th>Класс</th>
                        <th>Язык</th>
                        <th>Учебный год</th>
                        <th>Часов</th>
                        <th>Статус</th>
                        <th>Дни</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedPlans.map((p) => (
                        <tr key={p.id}>
                          <td>{subjectName(p.subjectId)}</td>
                          <td>{p.grade} класс</td>
                          <td>{languageName(p.language)}</td>
                          <td>{p.academicYear}</td>
                          <td>{p.totalHours}</td>
                          <td>
                            <span className={`badge badge-${statusTone(p.status)}`}>
                              {STATUS_LABEL[p.status] ?? p.status}
                            </span>
                          </td>
                          <td>{p.daysOfWeek ? `${p.daysOfWeek.split(",").map((d) => WEEKDAYS[Number(d) - 1]?.label ?? d).join(", ")}` : "—"}</td>
                          <td>
                            <button className="btn btn-sm btn-primary" onClick={() => onOpen(p.id)}>
                              Открыть
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {pendingDoc && (
          <div className="modal-overlay" onClick={() => setPendingDoc(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Проверьте документ ТУП перед созданием</h3>
              <p>
                Данные ТУП были извлечены из файла автоматически и могут содержать ошибки разбора. Перед созданием
                КТП рекомендуется сверить цели обучения с оригиналом документа.
              </p>
              <p>
                Источник: приказ МОН РК от {pendingDoc.orderDate} № {pendingDoc.orderNumber} ·{" "}
                {appendixLabel(pendingDoc.appendixNumber)} ·{" "}
                <a
                  className="ktp-source-link"
                  onClick={() =>
                    openUrl(adiletAppendixUrl(pendingDoc.language, pendingDoc.appendixNumber))
                  }
                >
                  открыть оригинал
                </a>
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setPendingDoc(null)}>Отмена</button>
                <button className="btn btn-sm btn-primary" onClick={() => generate(pendingDoc.id)}>
                  Создать КТП
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Panel } from "../components/ui";
import type { TupDocumentDetail, TupDocumentListItem } from "../types";
import { generateWordDocument } from "../lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { buildKtpFromTup, hoursPerWeekForGrade, totalHoursOf } from "../ktp/fromDb";
import { LessonRowType } from "../ktp/model/types";

function parseGrades(targetGrades: string): number[] {
  if (!targetGrades) return [];
  if (targetGrades.includes("-")) {
    const [lo, hi] = targetGrades.split("-").map((s) => Number(s.trim()));
    if (!isNaN(lo) && !isNaN(hi)) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  const single = Number(targetGrades.trim());
  return !isNaN(single) ? [single] : [];
}

interface KtpLessonView {
  number: number;
  section: string;
  topic: string;
  objectives: string;
  hours: number;
  type: LessonRowType;
}

export function Ktp() {
  const [documents, setDocuments] = useState<TupDocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  const [detail, setDetail] = useState<TupDocumentDetail | null>(null);
  const [lessons, setLessons] = useState<KtpLessonView[]>([]);
  const [status, setStatus] = useState<string>("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const docs = await api.fetchTupDocuments();
      setDocuments(docs);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

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

  // Сброс зависимых фильтров при смене предмета.
  const resetAfterSubject = () => {
    setSelectedLanguage("");
    setSelectedGrade(null);
    setSelectedDocId("");
    setDetail(null);
    setLessons([]);
    setStatus("");
  };

  const buildPlan = async (docId: string) => {
    if (!docId || selectedGrade == null) return;
    setStatus("Загрузка документа ТУП…");
    setError("");
    try {
      const d = await api.fetchTupDocument(docId);
      setDetail(d);
      const plan = buildKtpFromTup(d, selectedGrade);
      setLessons(
        plan.map((row) => ({
          number: row.lessonNumber,
          section: row.sectionName,
          topic: row.lessonTopic,
          objectives: row.objectives.map((o) => `${o.id}: ${o.description}`).join("\n"),
          hours: row.hours,
          type: row.rowType,
        })),
      );
      setStatus(`КТП построен: ${plan.length} строк, ${totalHoursOf(plan)} ч.`);
    } catch (e) {
      setError(String(e));
      setStatus("");
    }
  };

  const exportWord = () => {
    if (!detail || !selectedSubject || selectedGrade == null) return;
    const plan = buildKtpFromTup(detail, selectedGrade);
    generateWordDocument({
      subjectName: selectedSubject,
      className: `${selectedGrade} класс`,
      hoursPerWeek: hoursPerWeekForGrade(detail, selectedGrade),
      totalHours: totalHoursOf(plan),
      plan,
      quarterWorkHours: {
        q1: Math.round(totalHoursOf(plan) / 4),
        q2: Math.round(totalHoursOf(plan) / 4),
        q3: Math.round(totalHoursOf(plan) / 4),
        q4: totalHoursOf(plan) - 3 * Math.round(totalHoursOf(plan) / 4),
      },
    });
    setStatus(`Word сформирован: ${plan.length} строк.`);
  };

  const exportXlsx = (kundelik: boolean) => {
    if (!detail || selectedGrade == null) return;
    const plan = buildKtpFromTup(detail, selectedGrade);
    const fileName = `KTP_${selectedSubject}_${selectedGrade}`;
    if (kundelik) generateKundelikXlsx(plan, fileName);
    else generateXlsx(plan, fileName);
    setStatus(`Экспортировано (${plan.length} строк).`);
  };

  return (
    <Panel
      title="Календарно-тематическое планирование"
      subtitle="Генератор КТП из нормативного базиса (ТУП): предмет × класс × язык"
    >
      <div className="panel-body">
        {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}
        {loading && <div className="empty">Загрузка документов ТУП...</div>}
        {!loading && (
          <div className="filter-row" style={{ marginBottom: 16 }}>
            <select
              className="filter-select"
              style={{ minWidth: 220 }}
              value={selectedSubject}
              onChange={(e) => { setSelectedSubject(e.target.value); resetAfterSubject(); }}
            >
              <option value="">Предмет…</option>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              className="filter-select"
              style={{ minWidth: 120 }}
              value={selectedLanguage}
              onChange={(e) => { setSelectedLanguage(e.target.value); setSelectedGrade(null); setSelectedDocId(""); setDetail(null); setLessons([]); setStatus(""); }}
            >
              <option value="">Язык…</option>
              {languages.map((l) => (
                <option key={l} value={l}>{l.toUpperCase()}</option>
              ))}
            </select>

            <select
              className="filter-select"
              style={{ minWidth: 120 }}
              value={selectedGrade ?? ""}
              onChange={(e) => {
                const g = e.target.value ? Number(e.target.value) : null;
                setSelectedGrade(g);
                setSelectedDocId("");
                setDetail(null);
                setLessons([]);
                setStatus("");
              }}
            >
              <option value="">Класс…</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>{g} класс</option>
              ))}
            </select>

            <select
              className="filter-select"
              style={{ minWidth: 220 }}
              value={selectedDocId}
              onChange={(e) => { setSelectedDocId(e.target.value); buildPlan(e.target.value); }}
            >
              <option value="">Документ ТУП…</option>
              {candidateDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  Прил. {d.appendixNumber} · {d.targetGrades} · {d.language.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}

        {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}

        {detail && lessons.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={exportWord}>Скачать Word</button>{" "}
            <button className="btn btn-sm" onClick={() => exportXlsx(false)}>Экспорт XLSX</button>{" "}
            <button className="btn btn-sm" onClick={() => exportXlsx(true)}>Кунделик XLSX</button>
          </div>
        )}

        {lessons.length === 0 && !loading ? (
          <div className="empty">
            Выберите предмет, язык обучения и класс, затем документ ТУП — КТП будет построен из
            Долгосрочного плана (Параграф 3) с подстановкой целей обучения.
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>№</th>
                <th>Раздел</th>
                <th>Тема урока</th>
                <th>Цели обучения</th>
                <th>Часы</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => (
                <tr key={l.number} className={l.type === LessonRowType.QUARTER_HEADER ? "row-quarter" : undefined}>
                  <td>{l.number || ""}</td>
                  <td className="cell-main">{l.section}</td>
                  <td>{l.topic}</td>
                  <td style={{ whiteSpace: "pre-line", fontSize: 12 }}>{l.objectives}</td>
                  <td>{l.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
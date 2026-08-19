import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Panel } from "../components/ui";
import type { KtpPlan, KtpPlanCard, TupDocumentListItem } from "../types";
import { SUBJECT_NAMES } from "./SubjectNames";
import { IKtpLesson, KtpPlan as FlatPlan, LessonRowType } from "../ktp/model/types";
import {
  flattenPlan,
  unflattenPlan,
  renumberPlan,
  addHourToPlan,
  deleteLessonFromPlan,
  splitObjectivesInPlan,
  addSorToPlan,
  mergeLessonWithNext,
} from "../ktp/editorModel";
import { generateWordDocument } from "../lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { totalHoursOf } from "../ktp/fromDb";

function parseGrades(targetGrades: string): number[] {
  if (!targetGrades) return [];
  if (targetGrades.includes("-")) {
    const [lo, hi] = targetGrades.split("-").map((s) => Number(s.trim()));
    if (!isNaN(lo) && !isNaN(hi)) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  const single = Number(targetGrades.trim());
  return !isNaN(single) ? [single] : [];
}

const WEEKDAYS = [
  { num: 1, label: "Пн" },
  { num: 2, label: "Вт" },
  { num: 3, label: "Ср" },
  { num: 4, label: "Чт" },
  { num: 5, label: "Пт" },
  { num: 6, label: "Сб" },
];

const TYPE_LABEL: Record<string, string> = {
  standard: "Урок",
  sor: "СОР",
  soch: "СОЧ",
  repetition: "Повторение",
};

const rowBackground = (rt: LessonRowType, isOddSection: boolean): string => {
  switch (rt) {
    case LessonRowType.QUARTER_HEADER:
      return "var(--accent-soft, #eef0fb)";
    case LessonRowType.SOCH:
    case LessonRowType.REPETITION:
      return "var(--blue-soft, #e3edfb)";
    case LessonRowType.SOR:
      return "var(--amber-soft, #fdf2d8)";
    default:
      return isOddSection ? "#f5f5f5" : "var(--panel)";
  }
};

export function KtpEditor() {
  const [documents, setDocuments] = useState<TupDocumentListItem[]>([]);
  const [savedPlans, setSavedPlans] = useState<KtpPlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  const [dbPlan, setDbPlan] = useState<KtpPlan | null>(null);
  const [flat, setFlat] = useState<FlatPlan>([]);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([2, 4]);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<{ id: string; field: keyof IKtpLesson } | null>(null);
  const [draft, setDraft] = useState("");
  const [mergeDialog, setMergeDialog] = useState<string | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [mergedLessonId, setMergedLessonId] = useState<string | null>(null);

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

  const resetEditor = () => {
    setDbPlan(null);
    setFlat([]);
    setStatus("");
    setEditing(null);
    setMergeDialog(null);
  };

  const canGenerate = selectedDocId && selectedGrade != null;

  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError("");
    setStatus("Генерация плана из ТУП…");
    try {
      const plan = await api.generateKtpFromTup(selectedDocId, selectedGrade!, "2026-2027", 2026, daysOfWeek);
      setDbPlan(plan);
      setFlat(flattenPlan(plan));
      setStatus(`План сохранён: ${plan.totalHours} уроков.`);
    } catch (e) {
      setError(String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const loadSaved = async (planId: string) => {
    setBusy(true);
    setError("");
    setStatus("Загрузка плана…");
    try {
      const plan = await api.getKtpPlan(planId);
      setDbPlan(plan);
      setFlat(flattenPlan(plan));
      setSelectedSubject(SUBJECT_NAMES[plan.subjectId] ?? plan.subjectId);
      setSelectedGrade(plan.grade);
      setDaysOfWeek(plan.daysOfWeek.split(",").map((s) => Number(s)).filter(Boolean));
      setStatus(`План загружен: ${plan.totalHours} уроков.`);
    } catch (e) {
      setError(String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!dbPlan) return;
    setBusy(true);
    setError("");
    setStatus("Сохранение плана…");
    try {
      const nextDb = unflattenPlan(dbPlan, flat);
      const saved = await api.saveKtpPlan(nextDb);
      setDbPlan(saved);
      setFlat(flattenPlan(saved));
      await loadAll();
      setStatus(`План сохранён: ${saved.totalHours} уроков.`);
    } catch (e) {
      setError(String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const recalcSchedule = async () => {
    if (!dbPlan) return;
    setBusy(true);
    setError("");
    setStatus("Авторасчёт дат по календарю РК…");
    try {
      const nextDb = unflattenPlan(dbPlan, flat);
      const updated = await api.updateKtpSchedule(nextDb.id, daysOfWeek);
      setDbPlan(updated);
      setFlat(flattenPlan(updated));
      setStatus("Даты пересчитаны по календарю РК.");
    } catch (e) {
      setError(String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const applyEdit = () => {
    if (!editing) return;
    setFlat((prev) => renumberPlan(prev.map((l) => (l.id === editing.id ? { ...l, [editing.field]: draft } : l))));
    setEditing(null);
  };

  const beginEdit = (lesson: IKtpLesson, field: keyof IKtpLesson) => {
    setEditing({ id: lesson.id, field });
    setDraft(String(lesson[field] ?? ""));
  };

  const doAddHour = (lessonId: string) => setFlat((p) => addHourToPlan(p, lessonId));
  const doDeleteLesson = (lessonId: string) => {
    const res = deleteLessonFromPlan(flat, lessonId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setFlat(res.plan);
  };
  const doSplit = (lessonId: string) => setFlat((p) => splitObjectivesInPlan(p, lessonId));
  const doAddSor = (lessonId: string) => setFlat((p) => addSorToPlan(p, lessonId));

  const confirmMerge = () => {
    if (mergedLessonId) {
      setFlat((p) => mergeLessonWithNext(p, mergedLessonId, mergeReason));
    }
    setMergeDialog(null);
    setMergedLessonId(null);
    setMergeReason("");
  };

  const exportWord = () => {
    if (!dbPlan) return;
    const hoursPerWeek = dbPlan.quarters[0]?.hoursPerWeek ?? 2;
    const total = totalHoursOf(flat);
    const quarterWorkHours = { q1: 0, q2: 0, q3: 0, q4: 0 };
    let qi = 0;
    for (const l of flat) {
      if (l.rowType === LessonRowType.QUARTER_HEADER) {
        qi += 1;
        continue;
      }
      const key = `q${qi}` as keyof typeof quarterWorkHours;
      if (key in quarterWorkHours) quarterWorkHours[key] += l.hours;
    }
    generateWordDocument({
      subjectName: SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId,
      className: `${dbPlan.grade} класс`,
      hoursPerWeek,
      totalHours: total,
      plan: flat,
      quarterWorkHours,
    });
    setStatus(`Word сформирован: ${total} строк.`);
  };

  const exportXlsx = (kundelik: boolean) => {
    if (!dbPlan) return;
    const fileName = `KTP_${SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId}_${dbPlan.grade}`;
    if (kundelik) generateKundelikXlsx(flat, fileName);
    else generateXlsx(flat, fileName);
    setStatus(`Экспортировано (${flat.length} строк).`);
  };

  const planName = dbPlan
    ? `${SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId} · ${dbPlan.grade} класс · ${dbPlan.academicYear}`
    : "";

  return (
    <Panel
      title="Редактор КТП"
      subtitle="Интерактивный редактор (KTPHUB-совместимый): правки, СОР/СОЧ, даты по календарю РК, экспорт"
    >
      <div className="panel-body">
        {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}
        {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}
        {loading && <div className="empty">Загрузка…</div>}
        {!loading && (
          <>
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
                  resetEditor();
                }}
              >
                <option value="">Предмет…</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                className="filter-select"
                style={{ minWidth: 105 }}
                value={selectedLanguage}
                onChange={(e) => {
                  setSelectedLanguage(e.target.value);
                  setSelectedGrade(null);
                  setSelectedDocId("");
                  resetEditor();
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
                  resetEditor();
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
                onChange={(e) => {
                  setSelectedDocId(e.target.value);
                  resetEditor();
                }}
              >
                <option value="">Документ ТУП…</option>
                {candidateDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    Прил. {d.appendixNumber} · {d.targetGrades} · {d.language.toUpperCase()}
                  </option>
                ))}
              </select>

              <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy || !canGenerate}>
                {busy ? "…" : "Сгенерировать"}
              </button>
            </div>

            {savedPlans.length > 0 && (
              <div className="ktp-saved">
                <span className="ktp-schedule-label">Сохранённые планы:</span>
                {savedPlans.map((p) => (
                  <button
                    key={p.id}
                    className="btn btn-sm"
                    onClick={() => loadSaved(p.id)}
                    disabled={busy}
                  >
                    {SUBJECT_NAMES[p.subjectId] ?? p.subjectId} {p.grade} · {p.academicYear}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {dbPlan && (
          <>
            <div className="ktp-schedule">
              <span className="ktp-schedule-label">{planName}</span>
              <span style={{ marginLeft: 8 }}>Дни недели:</span>
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
              <button className="btn btn-sm" onClick={recalcSchedule} disabled={busy || daysOfWeek.length === 0}>
                Авторасчёт дат
              </button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                {busy ? "…" : "Сохранить"}
              </button>
              <button className="btn btn-sm" onClick={exportWord}>Word</button>
              <button className="btn btn-sm" onClick={() => exportXlsx(false)}>XLSX</button>
              <button className="btn btn-sm" onClick={() => exportXlsx(true)}>Кунделик</button>
            </div>

            <div className={`invariant ${dbPlan.invariant.valid ? "invariant-ok" : "invariant-bad"}`}>
              {dbPlan.invariant.valid
                ? "Инварианты оценивания соблюдены (FR-2.2, FR-2.3)"
                : "Нарушены инварианты оценивания — см. детали"}
            </div>
            {dbPlan.invariant.checks.length > 0 && (
              <div className="invariant-details">
                {dbPlan.invariant.checks.map((c) => (
                  <div key={c.quarterNumber} className={c.fr22Ok && c.fr23Ok ? "invariant-ok" : "invariant-bad"}>
                    <strong>Четверть {c.quarterNumber}:</strong> FR-2.2 {c.fr22Ok ? "✓" : "✗"} {c.fr22Message} ·{" "}
                    FR-2.3 {c.fr23Ok ? "✓" : "✗"} {c.fr23Message}
                  </div>
                ))}
              </div>
            )}

            <KtpTable
              flat={flat}
              editing={editing}
              draft={draft}
              setDraft={setDraft}
              beginEdit={beginEdit}
              applyEdit={applyEdit}
              onAddHour={doAddHour}
              onDelete={doDeleteLesson}
              onSplit={doSplit}
              onAddSor={doAddSor}
              onMerge={(id) => { setMergedLessonId(id); setMergeDialog(id); setMergeReason(""); }}
            />
          </>
        )}

        {!dbPlan && !loading && (
          <div className="empty">
            Выберите предмет, язык, класс и документ ТУП → «Сгенерировать», либо откройте сохранённый план.
            Двойной клик по ячейке — редактирование. Кнопки «+» / «−» — добавить/удалить час; «СОР» — добавить
            суммативное оценивание; «⇉» — объединить уроки.
          </div>
        )}

        {mergeDialog && (
          <div className="modal-overlay" onClick={() => setMergeDialog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Объединить уроки</h3>
              <p>Укажите причину объединения:</p>
              <input
                className="filter-select"
                style={{ width: "100%" }}
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setMergeDialog(null)}>Отмена</button>
                <button className="btn btn-sm btn-primary" onClick={confirmMerge}>Объединить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

interface KtpTableProps {
  flat: FlatPlan;
  editing: { id: string; field: keyof IKtpLesson } | null;
  draft: string;
  setDraft: (v: string) => void;
  beginEdit: (l: IKtpLesson, f: keyof IKtpLesson) => void;
  applyEdit: () => void;
  onAddHour: (id: string) => void;
  onDelete: (id: string) => void;
  onSplit: (id: string) => void;
  onAddSor: (id: string) => void;
  onMerge: (id: string) => void;
}

function KtpTable(props: KtpTableProps) {
  const { flat, editing, draft, setDraft, beginEdit, applyEdit, onAddHour, onDelete, onSplit, onAddSor, onMerge } = props;

  const uniqueSections = useMemo(() => {
    return Array.from(
      new Set(flat.filter((l) => l.rowType !== LessonRowType.QUARTER_HEADER).map((l) => l.sectionName)),
    );
  }, [flat]);

  const sectionIndex = (name: string) => uniqueSections.indexOf(name);

  const quarterWork = useMemo(() => {
    const map: Record<number, { planned: number; actual: number }> = {};
    let qi = 0;
    for (const l of flat) {
      if (l.rowType === LessonRowType.QUARTER_HEADER) {
        qi += 1;
        map[qi] = { planned: l.hours, actual: 0 };
        continue;
      }
      if (map[qi]) map[qi].actual += l.hours;
    }
    return map;
  }, [flat]);

  const isEditable = (f: string) => f === "lessonTopic" || f === "date" || f === "notes" || f === "sectionName";

  return (
    <table className="data">
      <thead>
        <tr>
          <th>№</th>
          <th>Тип</th>
          <th>Раздел</th>
          <th>Тема урока</th>
          <th>Цели обучения</th>
          <th>Часы</th>
          <th>Дата</th>
          <th>Примечание</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {flat.map((l, i) => {
          const prev = flat[i - 1];
          if (l.rowType === LessonRowType.QUARTER_HEADER) {
            const qn = sectionIndex(l.sectionName) + 1;
            const q = quarterWork[qn];
            const mismatch = q ? q.planned - q.actual : 0;
            return (
              <tr key={l.id} className="row-quarter">
                <td colSpan={9}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                    <span>{l.sectionName}</span>
                    <span>Часы (план): {q?.planned ?? 0}</span>
                    <span>Часы (факт): {q?.actual ?? 0}</span>
                    {mismatch !== 0 && (
                      <span style={{ color: "var(--red, #d93025)" }}>
                        {mismatch > 0
                          ? `Запланировано на ${mismatch} ч. больше`
                          : `Фактических на ${-mismatch} ч. больше`}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          }

          const isNewSection = !prev || prev.sectionName !== l.sectionName;
          const isNewTopic = !prev || prev.lessonTopic !== l.lessonTopic;
          const isOdd = sectionIndex(l.sectionName) % 2 !== 0;
          const isSectionEnd =
            (i + 1 >= flat.length ||
              flat[i + 1].sectionName !== l.sectionName ||
              flat[i + 1].rowType === LessonRowType.QUARTER_HEADER) &&
            l.rowType !== LessonRowType.SOCH &&
            l.rowType !== LessonRowType.REPETITION;

          const editableCell = (field: keyof IKtpLesson, display: string, isNew: boolean) => {
            const isEditing = editing?.id === l.id && editing.field === field;
            return (
              <td onDoubleClick={() => beginEdit(l, field)} title={isEditable(field as string) ? "Двойной клик — правка" : undefined}>
                {isEditing ? (
                  <input
                    className="ktp-inline-input"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={applyEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyEdit();
                      if (e.key === "Escape") { setDraft(""); applyEdit(); }
                    }}
                  />
                ) : (
                  isNew ? display : ""
                )}
              </td>
            );
          };

          return (
            <tr key={l.id} style={{ background: rowBackground(l.rowType, isOdd) }}>
              <td>{l.lessonNumber}</td>
              <td>{TYPE_LABEL[l.rowType]}</td>
              {editableCell("sectionName", l.sectionName, isNewSection)}
              {editableCell("lessonTopic", l.lessonTopic, isNewTopic)}
              <td>
                <div className="ktp-objectives">
                  {l.objectives.map((o) => (
                    <div key={o.id} className="ktp-objective" onDoubleClick={() => beginEdit(l, "lessonTopic")}>
                      <span className="chip">{o.id}</span>
                    </div>
                  ))}
                </div>
              </td>
              <td>{l.hours}</td>
              {editableCell("date", l.date, true)}
              {editableCell("notes", l.notes, true)}
              <td className="ktp-actions">
                <button className="btn btn-xs" title="Добавить час" onClick={() => onAddHour(l.id)}>+</button>
                <button className="btn btn-xs" title="Удалить урок" onClick={() => onDelete(l.id)}>−</button>
                {l.objectives.length > 1 && (
                  <button className="btn btn-xs" title="Разделить цели" onClick={() => onSplit(l.id)}>⇉</button>
                )}
                {flat[i + 1] && l.rowType === LessonRowType.STANDARD && flat[i + 1].rowType === LessonRowType.STANDARD && (
                  <button className="btn btn-xs" title="Объединить со следующим" onClick={() => onMerge(l.id)}>⤷</button>
                )}
                {isSectionEnd && (
                  <button className="btn btn-xs" title="Добавить СОР" onClick={() => onAddSor(l.id)}>СОР</button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

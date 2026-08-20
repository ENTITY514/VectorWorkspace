import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DndContext, closestCenter, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openUrl } from "@tauri-apps/plugin-opener";
import { v4 as uuidv4 } from "uuid";
import { api } from "../api";
import { Panel } from "../components/ui";
import type { KtpPlan, TupDocumentListItem } from "../types";
import { SUBJECT_NAMES } from "./SubjectNames";
import { IKtpLesson, ILessonObjective, KtpPlan as FlatPlan, LessonRowType } from "../ktp/model/types";
import {
  flattenPlan,
  unflattenPlan,
  renumberPlan,
  addHourToPlan,
  deleteLessonFromPlan,
  splitObjectivesInPlan,
  addSorToPlan,
  mergeLessonWithNext,
  reorderPlan,
  mergeObjectivesIntoLesson,
  mergeObjectivesWithNext,
  updateLessonInPlan,
} from "../ktp/editorModel";
import { generateWordDocument } from "../lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { totalHoursOf } from "../ktp/fromDb";
import { adiletAppendixUrl } from "../lib/adilet";
import { matchSourceDoc, sourceDocLabel } from "../lib/sourceDoc";
import { validateHours } from "../ktp/hoursValidation";
import { useHistory } from "../ktp/useHistory";
import { saveTemplate } from "../ktp/templateLib";
import type { KtpTemplate } from "../ktp/templateLib";

const WEEKDAYS = [
  { num: 1, label: "Пн" },
  { num: 2, label: "Вт" },
  { num: 3, label: "Ср" },
  { num: 4, label: "Чт" },
  { num: 5, label: "Пт" },
  { num: 6, label: "Сб" },
];

const rowBackground = (rt: LessonRowType, isOddSection: boolean, isMerged: boolean): string => {
  if (isMerged) return "#e1bee7";
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

interface Props {
  planId: string;
  onClose: () => void;
}

export function KtpEditor({ planId, onClose }: Props) {
  const [dbPlan, setDbPlan] = useState<KtpPlan | null>(null);
  const history = useHistory<FlatPlan>([]);
  const flat = history.state;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [sourceDoc, setSourceDoc] = useState<TupDocumentListItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateFor, setTemplateFor] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [unfilledQuarter, setUnfilledQuarter] = useState<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setStatus("");
      try {
        const plan = await api.getKtpPlan(planId);
        if (cancelled) return;
        setDbPlan(plan);
        history.reset(flattenPlan(plan));
        setDaysOfWeek(plan.daysOfWeek.split(",").map((s) => Number(s)).filter(Boolean));
        showToast(`План загружен: ${plan.totalHours} уроков.`);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, showToast, history]);

  // Источник плана: документ ТУП, из которого был сгенерирован план (A1).
  useEffect(() => {
    if (!dbPlan) return;
    let cancelled = false;
    api
      .fetchTupDocuments()
      .then((docs) => {
        if (cancelled) return;
        setSourceDoc(matchSourceDoc(docs, dbPlan.subjectId, dbPlan.grade, dbPlan.language));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dbPlan]);

  const [editing, setEditing] = useState<{ id: string; field: keyof IKtpLesson } | null>(null);
  const [draft, setDraft] = useState("");
  const [mergeFor, setMergeFor] = useState<string | null>(null);
  const [mergeReason, setMergeReason] = useState("");

  const save = async () => {
    if (!dbPlan) return;
    setBusy(true);
    setError("");
    setStatus("Сохранение плана…");
    try {
      const nextDb = unflattenPlan(dbPlan, flat);
      const saved = await api.saveKtpPlan(nextDb);
      setDbPlan(saved);
      history.reset(flattenPlan(saved));
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
      history.reset(flattenPlan(updated));
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
    history.commit(
      renumberPlan(flat.map((l) => (l.id === editing.id ? { ...l, [editing.field]: draft } : l))),
      "Изменить поле",
    );
    setEditing(null);
  };

  const beginEdit = (lesson: IKtpLesson, field: keyof IKtpLesson) => {
    setEditing({ id: lesson.id, field });
    setDraft(String(lesson[field] ?? ""));
  };

  const doAddHour = (lessonId: string) => history.commit(addHourToPlan(flat, lessonId), "Добавить час");
  const doDeleteLesson = (lessonId: string) => {
    const res = deleteLessonFromPlan(flat, lessonId);
    if (res.error) {
      setError(res.error);
      return;
    }
    history.commit(res.plan, "Удалить урок");
  };
  const doSplit = (lessonId: string) => history.commit(splitObjectivesInPlan(flat, lessonId), "Разделить цели");
  const doAddSor = (lessonId: string) => history.commit(addSorToPlan(flat, lessonId), "Добавить СОР");
  const doMergeObjectivesNext = (lessonId: string) =>
    history.commit(mergeObjectivesWithNext(flat, lessonId), "Объединить цели со следующим уроком");

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeIsObjective = (active.data.current as { type?: string } | undefined)?.type === "objective";
      const overIsObjective = (over.data.current as { type?: string } | undefined)?.type === "objective";

      if (activeIsObjective && overIsObjective) {
        const sourceLessonId = (active.data.current as { lessonId?: string } | undefined)?.lessonId;
        const targetLessonId = (over.data.current as { lessonId?: string } | undefined)?.lessonId;
        if (sourceLessonId && targetLessonId && sourceLessonId !== targetLessonId) {
          history.commit(mergeObjectivesIntoLesson(flat, sourceLessonId, targetLessonId), "Объединить цели");
        }
      } else if (!activeIsObjective && !overIsObjective && active.id !== over.id) {
        const res = reorderPlan(flat, String(active.id), String(over.id));
        if (res.error) {
          setError(res.error);
          showToast(res.error);
          return;
        }
        history.commit(res.plan, "Переместить урок");
      }
    },
    [flat, history, showToast],
  );

  const updateLesson = useCallback(
    (id: string, field: keyof IKtpLesson, value: string | number | ILessonObjective[]) => {
      history.commit(updateLessonInPlan(flat, id, field, value), "Изменить урок");
    },
    [flat, history],
  );

  const confirmMerge = () => {
    if (mergeFor) {
      history.commit(mergeLessonWithNext(flat, mergeFor, mergeReason), "Объединить уроки");
    }
    setMergeFor(null);
    setMergeReason("");
  };

  // B1: горячие клавиши Ctrl+Z / Ctrl+Y (+Shift+Z).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  const doSaveTemplate = () => {
    if (!dbPlan || !templateName.trim()) return;
    const snapshot = unflattenPlan(dbPlan, flat);
    const t: KtpTemplate = {
      id: uuidv4(),
      name: templateName.trim(),
      subjectId: dbPlan.subjectId,
      grade: dbPlan.grade,
      language: dbPlan.language,
      academicYear: dbPlan.academicYear,
      createdAt: new Date().toISOString(),
      plan: snapshot,
    };
    saveTemplate(t);
    setTemplateFor(false);
    setTemplateName("");
    showToast(`Шаблон «${t.name}» сохранён.`);
  };

  const hoursPerWeek = dbPlan?.quarters[0]?.hoursPerWeek ?? 0;
  const hoursReport = useMemo(() => validateHours(flat, hoursPerWeek), [flat, hoursPerWeek]);

  const progress = useMemo(() => {
    const byQuarter: { done: number; total: number }[] = [];
    let qi = -1;
    let done = 0;
    let total = 0;
    const unfilledByQuarter: Record<number, IKtpLesson[]> = {};
    for (const l of flat) {
      if (l.rowType === LessonRowType.QUARTER_HEADER) {
        if (qi >= 0) byQuarter[qi] = { done, total };
        qi += 1;
        done = 0;
        total = 0;
        unfilledByQuarter[qi + 1] = [];
        continue;
      }
      total += 1;
      const special = l.rowType === LessonRowType.SOCH || l.rowType === LessonRowType.REPETITION || l.rowType === LessonRowType.SOR;
      const filled = Boolean(l.lessonTopic) && Boolean(l.date) && (special || l.objectives.length > 0);
      if (filled) done += 1;
      else unfilledByQuarter[qi + 1]?.push(l);
    }
    if (qi >= 0) byQuarter[qi] = { done, total };
    return { byQuarter, unfilledByQuarter };
  }, [flat]);

  const exportWord = async () => {
    if (!dbPlan) return;
    setBusy(true);
    setError("");
    try {
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
      await generateWordDocument({
        subjectName: SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId,
        className: `${dbPlan.grade} класс`,
        hoursPerWeek,
        totalHours: total,
        plan: flat,
        quarterWorkHours,
        sourceLabel: sourceDoc ? sourceDocLabel(sourceDoc) : "Источник не определён",
      });
      setStatus(`Word сформирован: ${total} строк.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportXlsx = async (kundelik: boolean) => {
    if (!dbPlan) return;
    setBusy(true);
    setError("");
    try {
      const fileName = `KTP_${SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId}_${dbPlan.grade}`;
      if (kundelik) await generateKundelikXlsx(flat, fileName);
      else await generateXlsx(flat, fileName);
      setStatus(`Экспортировано (${flat.length} строк).`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const planName = dbPlan
    ? `${SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId} · ${dbPlan.grade} класс · ${dbPlan.language} · ${dbPlan.academicYear}`
    : "";

  return (
    <Panel
      title="Редактор КТП"
      actions={
        <button className="btn btn-sm" onClick={onClose}>
          ← К списку
        </button>
      }
    >
      <div className="panel-body">
        {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}
        {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}
        {toast && <div className="toast">{toast}</div>}
        {loading && <div className="empty">Загрузка плана…</div>}

        {!loading && !dbPlan && !error && <div className="empty">План не найден.</div>}

        {dbPlan && (
          <>
            <div className="ktp-schedule">
              <span className="ktp-schedule-label">{planName}</span>
              {sourceDoc ? (
                <a
                  className="ktp-source-link"
                  title="Открыть оригинал документа ТУП"
                  onClick={() => openUrl(adiletAppendixUrl(sourceDoc.language, sourceDoc.appendixNumber))}
                >
                  {sourceDocLabel(sourceDoc)} · [ссылка]
                </a>
              ) : (
                <span className="ktp-source-missing">Источник не определён — создайте КТП из документа ТУП.</span>
              )}
              <span style={{ marginLeft: "auto" }}>Дни недели:</span>
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
              <button
                className="btn btn-sm"
                disabled={!history.canUndo}
                onClick={() => history.undo()}
                title="Отменить (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                className="btn btn-sm"
                disabled={!history.canRedo}
                onClick={() => history.redo()}
                title="Повторить (Ctrl+Y)"
              >
                ↷
              </button>
              <button className="btn btn-sm" onClick={() => setHistoryOpen((v) => !v)} title="История изменений">
                История
              </button>
              <button className="btn btn-sm" onClick={() => setTemplateFor(true)} title="Сохранить план как шаблон">
                В шаблон
              </button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                {busy ? "…" : "Сохранить"}
              </button>
            </div>

            {historyOpen && (
              <div className="ktp-history">
                <div className="ktp-history-title">История изменений</div>
                {history.labels.length === 0 ? (
                  <div className="muted">Пока нет действий.</div>
                ) : (
                  history.labels
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <div key={history.labels.length - i} className="ktp-history-item">
                        <span>{h.label}</span>
                        <span className="muted">{new Date(h.ts).toLocaleTimeString()}</span>
                      </div>
                    ))
                )}
              </div>
            )}

            <HoursPanel report={hoursReport} />
            <ProgressPanel progress={progress} onShowQuarter={setUnfilledQuarter} />

            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <KtpTable
                flat={flat}
                editing={editing}
                draft={draft}
                setDraft={setDraft}
                beginEdit={beginEdit}
                applyEdit={applyEdit}
                onUpdate={updateLesson}
                onAddHour={doAddHour}
                onDelete={doDeleteLesson}
                onSplit={doSplit}
                onAddSor={doAddSor}
                onMerge={(id) => { setMergeFor(id); setMergeReason(""); }}
                onMergeObjectivesNext={doMergeObjectivesNext}
              />
            </DndContext>

            <div className="ktp-export-block">
              <div className="ktp-export-head">Экспорт</div>
              <div className="ktp-export-buttons">
                <button className="btn btn-export" onClick={exportWord}>Word</button>
                <button className="btn btn-export" onClick={() => exportXlsx(false)}>XLSX</button>
                <button className="btn btn-export" onClick={() => exportXlsx(true)}>Кунделик</button>
              </div>
            </div>

            <div className="empty" style={{ marginTop: 12 }}>
              Перетаскивайте строку за ручку «⠿» для смены порядка уроков (только внутри раздела и четверти); цель —
              перетащите на ячейку целей другого урока, чтобы объединить цели в нём. Двойной клик по ячейке — правка.
            </div>
          </>
        )}

        {mergeFor && (
          <div className="modal-overlay" onClick={() => setMergeFor(null)}>
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
                <button className="btn btn-sm" onClick={() => setMergeFor(null)}>Отмена</button>
                <button className="btn btn-sm btn-primary" onClick={confirmMerge}>Объединить</button>
              </div>
            </div>
          </div>
        )}

        {templateFor && (
          <div className="modal-overlay" onClick={() => setTemplateFor(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Сохранить как шаблон</h3>
              <p>Шаблон можно будет клонировать на параллельный класс из списка КТП.</p>
              <input
                className="filter-select"
                style={{ width: "100%" }}
                placeholder="Название шаблона"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setTemplateFor(false)}>Отмена</button>
                <button className="btn btn-sm btn-primary" disabled={!templateName.trim()} onClick={doSaveTemplate}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {unfilledQuarter != null && (
          <div className="modal-overlay" onClick={() => setUnfilledQuarter(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Незаполненные уроки · {unfilledQuarter}-я четверть</h3>
              {progress.unfilledByQuarter[unfilledQuarter]?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {progress.unfilledByQuarter[unfilledQuarter].map((l) => (
                    <li key={l.id}>
                      №{l.lessonNumber}: {l.lessonTopic || "(без темы)"} — {l.sectionName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Все уроки заполнены.</p>
              )}
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setUnfilledQuarter(null)}>Закрыть</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function HoursPanel({ report }: { report: ReturnType<typeof validateHours> }) {
  return (
    <div className={`ktp-hours ktp-hours-${report.overallOk ? "ok" : "warn"}`}>
      <div className="ktp-hours-title">
        Часы: норма {report.norm} ч. ({report.hoursPerWeek} ч/нед) · {report.overallMessage}
      </div>
      {report.quarters.map((q) => (
        <div key={q.quarterNumber} className={q.ok ? "" : "ktp-hours-warn"}>
          {q.quarterNumber}-я четв.: {q.message}.
        </div>
      ))}
    </div>
  );
}

function ProgressPanel({
  progress,
  onShowQuarter,
}: {
  progress: { byQuarter: { done: number; total: number }[]; unfilledByQuarter: Record<number, IKtpLesson[]> };
  onShowQuarter: (q: number) => void;
}) {
  const totalDone = progress.byQuarter.reduce((s, q) => s + q.done, 0);
  const total = progress.byQuarter.reduce((s, q) => s + q.total, 0);
  const pct = total === 0 ? 0 : Math.round((totalDone / total) * 100);
  return (
    <div className="ktp-progress">
      <div className="ktp-progress-total">
        Готовность: {totalDone}/{total} ({pct}%)
        <div className="ktp-progress-bar">
          <div className="ktp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {progress.byQuarter.map((q, i) => {
        const qp = q.total === 0 ? 0 : Math.round((q.done / q.total) * 100);
        return (
          <button
            key={i}
            className="ktp-progress-quarter"
            onClick={() => onShowQuarter(i + 1)}
            title={`${i + 1}-я четверть: ${q.done}/${q.total}`}
          >
            {i + 1}·{qp}%
            <div className="ktp-progress-bar">
              <div className="ktp-progress-fill" style={{ width: `${qp}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface KtpTableProps {
  flat: FlatPlan;
  editing: { id: string; field: keyof IKtpLesson } | null;
  draft: string;
  setDraft: (v: string) => void;
  beginEdit: (l: IKtpLesson, f: keyof IKtpLesson) => void;
  applyEdit: () => void;
  onUpdate: (id: string, field: keyof IKtpLesson, value: string | number | ILessonObjective[]) => void;
  onAddHour: (id: string) => void;
  onDelete: (id: string) => void;
  onSplit: (id: string) => void;
  onAddSor: (id: string) => void;
  onMerge: (id: string) => void;
  onMergeObjectivesNext: (id: string) => void;
}

function ObjectiveCell({ lesson, onUpdate }: { lesson: IKtpLesson; onUpdate: KtpTableProps["onUpdate"] }) {
  const [editingObjective, setEditingObjective] = useState<{ objectiveId: string; description: string } | null>(null);

  const { attributes, listeners, setNodeRef: draggableRef, transform } = useDraggable({
    id: `draggable-objective-${lesson.id}`,
    data: { type: "objective", lessonId: lesson.id },
  });

  const { setNodeRef: droppableRef } = useDroppable({
    id: `droppable-objective-${lesson.id}`,
    data: { type: "objective", lessonId: lesson.id },
  });

  const handleObjectiveBlur = () => {
    if (editingObjective) {
      const newObjectives = lesson.objectives.map((o) =>
        o.id === editingObjective.objectiveId ? { ...o, description: editingObjective.description } : o,
      );
      onUpdate(lesson.id, "objectives", newObjectives);
      setEditingObjective(null);
    }
  };

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <td ref={droppableRef}>
      <div ref={draggableRef} style={style} {...listeners} {...attributes} className="ktp-objectives">
        {lesson.objectives.length === 0 && <span className="muted">—</span>}
        {lesson.objectives.map((objective) => (
          <div
            key={objective.id}
            className="ktp-objective"
            onDoubleClick={() =>
              setEditingObjective({ objectiveId: objective.id, description: objective.description })
            }
          >
            {editingObjective && editingObjective.objectiveId === objective.id ? (
              <input
                className="ktp-inline-input"
                type="text"
                value={editingObjective.description}
                onChange={(e) =>
                  setEditingObjective({ ...editingObjective, description: e.target.value })
                }
                onBlur={handleObjectiveBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleObjectiveBlur();
                  if (e.key === "Escape") { setEditingObjective(null); }
                }}
                autoFocus
              />
            ) : (
              <>
                <span className="ktp-objective-code">{objective.id}</span>
                {objective.description}
              </>
            )}
          </div>
        ))}
      </div>
    </td>
  );
}

function SortableRow({ id, background, children }: { id: string; background?: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: "relative",
    background,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td className="ktp-drag-handle" {...listeners} title="Перетащить">
        ⠿
      </td>
      {children}
    </tr>
  );
}

function KtpTable(props: KtpTableProps) {
  const {
    flat,
    editing,
    draft,
    setDraft,
    beginEdit,
    applyEdit,
    onUpdate,
    onAddHour,
    onDelete,
    onSplit,
    onAddSor,
    onMerge,
    onMergeObjectivesNext,
  } = props;

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

  const isEditable = (f: string) => f === "sectionName" || f === "lessonTopic" || f === "date";

  return (
    <div className="ktp-table-wrap">
      <table className="data ktp-table">
        <thead>
          <tr>
            <th className="ktp-drag-handle"></th>
            <th>№</th>
            <th>Часы</th>
            <th>Раздел</th>
            <th>Тема урока</th>
            <th>Цели обучения</th>
            <th>Кол-во часов</th>
            <th>Дата</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          <SortableContext items={flat.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {flat.map((l, i) => {
              const prev = flat[i - 1];
              if (l.rowType === LessonRowType.QUARTER_HEADER) {
                const qn = sectionIndex(l.sectionName) + 1;
                const q = quarterWork[qn];
                const mismatch = q ? q.planned - q.actual : 0;
                return (
                  <tr key={l.id} className="row-quarter">
                    <td></td>
                    <td colSpan={8}>
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
              const nextLesson = flat[i + 1];
              const isLast = i + 1 >= flat.length;

              // A3: плашка раздела не рисуется после СОР/СОЧ/повторения.
              const isSectionStart =
                l.rowType === LessonRowType.STANDARD &&
                isNewSection &&
                Boolean(l.sectionName) &&
                Boolean(prev) &&
                prev.rowType !== LessonRowType.SOR &&
                prev.rowType !== LessonRowType.SOCH &&
                prev.rowType !== LessonRowType.REPETITION;

              // A3: кнопка «Добавить СОР» — на последнем обычном уроке раздела
              // без уже стоящего после него СОР.
              const alreadyHasSorAfter = Boolean(
                nextLesson && nextLesson.rowType === LessonRowType.SOR,
              );
              const isSectionEnd =
                l.rowType === LessonRowType.STANDARD &&
                !alreadyHasSorAfter &&
                (isLast ||
                  nextLesson.rowType === LessonRowType.QUARTER_HEADER ||
                  nextLesson.rowType === LessonRowType.SOCH ||
                  nextLesson.rowType === LessonRowType.REPETITION ||
                  nextLesson.sectionName !== l.sectionName);

              const sectionHours = isSectionStart
                ? flat.filter(
                    (x) => x.sectionName === l.sectionName && x.rowType === LessonRowType.STANDARD,
                  ).length
                : 0;

              const currentIndex = flat.findIndex((x) => x.id === l.id);
              const nextAfter = flat[currentIndex + 1];
              const isMergedWithPrev = Boolean(l.date && prev && prev.date && l.date === prev.date);
              const isMergedWithNext = Boolean(l.date && nextAfter && nextAfter.date && l.date === nextAfter.date);
              const isMerged = isMergedWithPrev || isMergedWithNext;

              const sectionHoursCount =
                l.rowType === LessonRowType.STANDARD
                  ? flat.filter(
                      (x) =>
                        x.sectionName === l.sectionName &&
                        x.lessonNumber <= l.lessonNumber &&
                        x.rowType === LessonRowType.STANDARD,
                    ).length
                  : l.hoursInSection;

              const editableCell = (field: keyof IKtpLesson, display: string, isNew: boolean, className?: string) => {
                const isEditing = editing?.id === l.id && editing.field === field;
                return (
                  <td
                    className={className}
                    onDoubleClick={() => beginEdit(l, field)}
                    title={isEditable(field as string) ? "Двойной клик — правка" : undefined}
                  >
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

              // A8/A9: СОЧ и повторения — тема и цель в одну строку.
              const mergedTopicCell =
                l.rowType === LessonRowType.SOCH || l.rowType === LessonRowType.REPETITION;
              const isEditingTopic = editing?.id === l.id && editing.field === "lessonTopic";

              return (
                <Fragment key={l.id}>
                  {isSectionStart && (
                    <tr className="ktp-section-header">
                      <td></td>
                      <td colSpan={8}>
                        <span className="ktp-section-title">Раздел: {l.sectionName}</span>
                        <span className="ktp-section-hours">{sectionHours} ч.</span>
                      </td>
                    </tr>
                  )}
                  <SortableRow id={l.id} background={rowBackground(l.rowType, isOdd, isMerged)}>
                    <td>{l.lessonNumber}</td>
                    <td>{sectionHoursCount}</td>
                    {mergedTopicCell ? (
                      <>
                        {editableCell("sectionName", l.sectionName, isNewSection)}
                        <td
                          colSpan={2}
                          className="ktp-topic-objective"
                          onDoubleClick={() => beginEdit(l, "lessonTopic")}
                          title="Двойной клик — правка темы"
                        >
                          {isEditingTopic ? (
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
                            <span className="ktp-topic-inline">{l.lessonTopic}</span>
                          )}
                          {l.objectives.map((o) => (
                            <span key={o.id} className="chip">{o.id}: {o.description}</span>
                          ))}
                        </td>
                      </>
                    ) : (
                      <>
                        {editableCell("sectionName", l.sectionName, isNewSection)}
                        {editableCell(
                          "lessonTopic",
                          l.lessonTopic,
                          isNewTopic || l.rowType === LessonRowType.SOR,
                        )}
                        <ObjectiveCell lesson={l} onUpdate={onUpdate} />
                      </>
                    )}
                    <td>{l.hours}</td>
                    {editableCell("date", isMergedWithPrev ? "" : l.date, true, "ktp-date-cell")}
                    <td className="ktp-actions">
                      <button className="btn btn-xs" title="Добавить час" onClick={() => onAddHour(l.id)}>+</button>
                      <button className="btn btn-xs" title="Удалить урок" onClick={() => onDelete(l.id)}>−</button>
                      {l.objectives.length > 1 && (
                        <button className="btn btn-xs" title="Разделить цели" onClick={() => onSplit(l.id)}>⇉</button>
                      )}
                      {l.rowType === LessonRowType.STANDARD &&
                        nextLesson &&
                        nextLesson.rowType === LessonRowType.STANDARD && (
                          <>
                            <button
                              className="btn btn-xs"
                              title="Объединить со следующим (общая дата + причина)"
                              onClick={() => onMerge(l.id)}
                            >
                              ⤷
                            </button>
                            <button
                              className="btn btn-xs"
                              title="Объединить цели со следующим уроком"
                              onClick={() => onMergeObjectivesNext(l.id)}
                            >
                              ⇶
                            </button>
                          </>
                        )}
                      {isSectionEnd && (
                        <button className="btn btn-xs" title="Добавить СОР" onClick={() => onAddSor(l.id)}>СОР</button>
                      )}
                    </td>
                  </SortableRow>
                </Fragment>
              );
            })}
          </SortableContext>
        </tbody>
      </table>
    </div>
  );
}
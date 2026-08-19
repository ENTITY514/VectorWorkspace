import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DndContext, closestCenter, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  updateLessonInPlan,
} from "../ktp/editorModel";
import { generateWordDocument } from "../lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { totalHoursOf } from "../ktp/fromDb";
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
  const [flat, setFlat] = useState<FlatPlan>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [sourceDoc, setSourceDoc] = useState<TupDocumentListItem | null>(null);

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
        setFlat(flattenPlan(plan));
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
  }, [planId, showToast]);

  // Источник плана: документ ТУП, из которого был сгенерирован план.
  useEffect(() => {
    if (!dbPlan) return;
    let cancelled = false;
    api
      .fetchTupDocuments()
      .then((docs) => {
        if (cancelled) return;
        const match =
          docs.find(
            (d) =>
              d.subjectId === dbPlan.subjectId &&
              d.language.toUpperCase() === dbPlan.language.toUpperCase() &&
              parseGrades(d.targetGrades).includes(dbPlan.grade),
          ) ??
          docs.find(
            (d) => d.subjectId === dbPlan.subjectId && parseGrades(d.targetGrades).includes(dbPlan.grade),
          );
        setSourceDoc(match ?? null);
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
      setFlat(flattenPlan(saved));
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeIsObjective = (active.data.current as { type?: string } | undefined)?.type === "objective";
    const overIsObjective = (over.data.current as { type?: string } | undefined)?.type === "objective";

    if (activeIsObjective && overIsObjective) {
      const sourceLessonId = (active.data.current as { lessonId?: string } | undefined)?.lessonId;
      const targetLessonId = (over.data.current as { lessonId?: string } | undefined)?.lessonId;
      if (sourceLessonId && targetLessonId && sourceLessonId !== targetLessonId) {
        setFlat((p) => mergeObjectivesIntoLesson(p, sourceLessonId, targetLessonId));
      }
    } else if (!activeIsObjective && !overIsObjective) {
      if (active.id !== over.id) {
        setFlat((p) => reorderPlan(p, String(active.id), String(over.id)));
      }
    }
  }, []);

  const updateLesson = useCallback(
    (id: string, field: keyof IKtpLesson, value: string | number | ILessonObjective[]) => {
      setFlat((p) => updateLessonInPlan(p, id, field, value));
    },
    [],
  );

  const confirmMerge = () => {
    if (mergeFor) {
      setFlat((p) => mergeLessonWithNext(p, mergeFor, mergeReason));
    }
    setMergeFor(null);
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
              {sourceDoc && (
                <a
                  className="ktp-source-link"
                  title="Открыть оригинал документа ТУП"
                  onClick={() => openUrl(adiletAppendixUrl(sourceDoc.language, sourceDoc.appendixNumber))}
                >
                  Источник: приказ МОН РК от {sourceDoc.orderDate} № {sourceDoc.orderNumber} · {appendixLabel(sourceDoc.appendixNumber)}
                </a>
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
              <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                {busy ? "…" : "Сохранить"}
              </button>
            </div>

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
              Перетаскивайте строку за ручку «⠿» для смены порядка уроков; цель — перетащите на ячейку целей другого
              урока, чтобы объединить цели в нём. Двойной клик по ячейке — правка.
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
  onUpdate: (id: string, field: keyof IKtpLesson, value: string | number | ILessonObjective[]) => void;
  onAddHour: (id: string) => void;
  onDelete: (id: string) => void;
  onSplit: (id: string) => void;
  onAddSor: (id: string) => void;
  onMerge: (id: string) => void;
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
  const { flat, editing, draft, setDraft, beginEdit, applyEdit, onUpdate, onAddHour, onDelete, onSplit, onAddSor, onMerge } = props;

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
            const isSectionEnd =
              (i + 1 >= flat.length ||
                flat[i + 1].sectionName !== l.sectionName ||
                flat[i + 1].rowType === LessonRowType.QUARTER_HEADER) &&
              l.rowType !== LessonRowType.SOCH &&
              l.rowType !== LessonRowType.REPETITION;

            const isSectionStart =
              l.rowType === LessonRowType.STANDARD && isNewSection && Boolean(l.sectionName);
            const sectionHours = isSectionStart
              ? flat.filter(
                  (x) => x.sectionName === l.sectionName && x.rowType === LessonRowType.STANDARD,
                ).length
              : 0;

            const currentIndex = flat.findIndex((x) => x.id === l.id);
            const nextLesson = flat[currentIndex + 1];
            const isMergedWithPrev = Boolean(l.date && prev && prev.date && l.date === prev.date);
            const isMergedWithNext = Boolean(l.date && nextLesson && nextLesson.date && l.date === nextLesson.date);
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
                {editableCell("sectionName", l.sectionName, isNewSection)}
                {editableCell("lessonTopic", l.lessonTopic, isNewTopic)}
                <ObjectiveCell lesson={l} onUpdate={onUpdate} />
                <td>{l.hours}</td>
                {editableCell("date", isMergedWithPrev ? "" : l.date, true, "ktp-date-cell")}
                <td className="ktp-actions">
                  <button className="btn btn-xs" title="Добавить час" onClick={() => onAddHour(l.id)}>+</button>
                  <button className="btn btn-xs" title="Удалить урок" onClick={() => onDelete(l.id)}>−</button>
                  {l.objectives.length > 1 && (
                    <button className="btn btn-xs" title="Разделить цели" onClick={() => onSplit(l.id)}>⇉</button>
                  )}
                  {nextLesson && l.rowType === LessonRowType.STANDARD && nextLesson.rowType === LessonRowType.STANDARD && (
                    <button className="btn btn-xs" title="Объединить со следующим" onClick={() => onMerge(l.id)}>⤷</button>
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
  );
}
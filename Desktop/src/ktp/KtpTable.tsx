import { Fragment, useState, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IKtpLesson, ILessonObjective, LessonRowType, KtpPlan as FlatPlan } from "./model/types";

type EditableField = "sectionName" | "lessonTopic" | "date" | "notes";

const rowBackground = (rt: LessonRowType, isOddSection: boolean, isMerged: boolean): string => {
  if (isMerged) return "var(--accent-subtle)";
  switch (rt) {
    case LessonRowType.QUARTER_HEADER:
      return "var(--accent-subtle)";
    case LessonRowType.SOCH:
    case LessonRowType.REPETITION:
      return "var(--accent-subtle)";
    case LessonRowType.SOR:
      return "var(--status-warning-bg)";
    default:
      return isOddSection ? "var(--bg-subtle)" : "var(--bg-surface)";
  }
};

export interface KtpTableProps {
  flat: FlatPlan;
  editing: { id: string; field: EditableField } | null;
  draft: string;
  setDraft: (v: string) => void;
  beginEdit: (l: IKtpLesson, f: EditableField) => void;
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

export function KtpTable(props: KtpTableProps) {
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
                          <span style={{ color: "var(--status-error-text)" }}>
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

              const editableCell = (field: EditableField, display: string, isNew: boolean, className?: string) => {
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

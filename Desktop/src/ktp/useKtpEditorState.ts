import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { api } from "../services/api";
import type { KtpPlan, TupDocumentListItem } from "../types";
import { SUBJECT_NAMES, subjectName } from "../panels/SubjectNames";
import { IKtpLesson, ILessonObjective, KtpPlan as FlatPlan, LessonRowType } from "./model/types";
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
} from "./editorModel";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { generateWordDocument } from "../lib/word-generator";
import { totalHoursOf } from "./fromDb";
import { sourceDocLabel, matchSourceDoc } from "../lib/sourceDoc";
import { validateHours } from "./hoursValidation";
import { checkInvariants } from "./invariants";
import { useHistory } from "./useHistory";
import { saveTemplate, KtpTemplate } from "./templateLib";

type EditableField = "sectionName" | "lessonTopic" | "date" | "notes";

export function useKtpEditorState(planId: string) {
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
  const [selectedQuarter, setSelectedQuarter] = useState(0);
  /// Снимок последнего сохранённого плана. Нужен, чтобы отличать
  /// «есть правки» от «была отмена до исходного состояния»: canUndo для
  /// этого не годится и приводил бы к ложным предупреждениям.
  const savedSnapshot = useRef<string>("");
  const suppressBlur = useRef(false);

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
        const loaded = flattenPlan(plan);
        savedSnapshot.current = JSON.stringify(loaded);
        history.reset(loaded);
        setDaysOfWeek(plan.daysOfWeek.split(",").map((s: string) => Number(s)).filter(Boolean));
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

  const [editing, setEditing] = useState<{ id: string; field: EditableField } | null>(null);
  const [draft, setDraft] = useState("");
  const [mergeFor, setMergeFor] = useState<string | null>(null);
  const [mergeReason, setMergeReason] = useState("");

  const planToDb = () => {
    if (!dbPlan) return null;
    return { ...unflattenPlan(dbPlan, flat), daysOfWeek: daysOfWeek.join(",") };
  };

  const save = async () => {
    if (!dbPlan) return;
    setBusy(true);
    setError("");
    setStatus("Сохранение плана…");
    try {
      const nextDb = planToDb();
      if (!nextDb) return;
      const saved = await api.saveKtpPlan(nextDb);
      setDbPlan(saved);
      const savedFlat = flattenPlan(saved);
      savedSnapshot.current = JSON.stringify(savedFlat);
      history.reset(savedFlat);
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
      const nextDb = planToDb();
      if (!nextDb) return;
      const savedSnapshotNow = JSON.stringify(flat);
      if (savedSnapshot.current !== savedSnapshotNow) {
        await api.saveKtpPlan(nextDb);
      }
      const updated = await api.updateKtpSchedule(nextDb.id, daysOfWeek);
      setDbPlan(updated);
      const updatedFlat = flattenPlan(updated);
      savedSnapshot.current = JSON.stringify(updatedFlat);
      history.reset(updatedFlat);
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
    const cur = flat.find((l) => l.id === editing.id);
    if (cur && String(cur[editing.field] ?? "") === draft) {
      setEditing(null);
      return;
    }
    history.commit(
      renumberPlan(flat.map((l) => (l.id === editing.id ? { ...l, [editing.field]: draft } : l))),
      "Изменить поле",
    );
    setEditing(null);
  };

  const applyEditFromBlur = () => {
    if (suppressBlur.current) {
      suppressBlur.current = false;
      return;
    }
    applyEdit();
  };

  const cancelEdit = () => {
    suppressBlur.current = true;
    setEditing(null);
    setDraft("");
  };

  const beginEdit = (lesson: IKtpLesson, field: EditableField) => {
    setEditing({ id: lesson.id, field });
    setDraft(String(lesson[field] ?? ""));
  };

  const EDIT_FIELDS: EditableField[] = ["sectionName", "lessonTopic", "date", "notes"];

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

  const tabNext = (lesson: IKtpLesson, field: EditableField) => {
    applyEdit();
    suppressBlur.current = true;
    const fi = EDIT_FIELDS.indexOf(field);
    const rows = visibleFlat.filter((l) => l.rowType !== LessonRowType.QUARTER_HEADER);
    const li = rows.findIndex((l) => l.id === lesson.id);
    if (fi >= 0 && fi + 1 < EDIT_FIELDS.length) {
      const current = visibleFlat.find((l) => l.id === lesson.id);
      if (current) beginEdit(current, EDIT_FIELDS[fi + 1]);
      return;
    }
    const next = rows[li + 1];
    if (next) beginEdit(next, EDIT_FIELDS[0]);
  };

  const doSaveTemplate = () => {
    if (!dbPlan || !templateName.trim()) return;
    const snapshot = planToDb() ?? unflattenPlan(dbPlan, flat);
    const t: KtpTemplate = {
      id: crypto.randomUUID(),
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

  // Часы в неделю берутся ПО КАЖДОЙ четверти: схема хранит их отдельно, и у
  // предмета они действительно различаются. Прежде сюда шло значение только
  // первой четверти, и норма для остальных считалась неверно.
  /// Есть ли несохранённые правки. Сравнение со снимком, а не с историей:
  /// отмена всех действий возвращает план к исходному виду, и предупреждать
  /// в этом случае не о чем.
  const isDirty = useMemo(() => {
    if (savedSnapshot.current === "") return false;
    const daysChanged = dbPlan ? daysOfWeek.join(",") !== dbPlan.daysOfWeek : false;
    return JSON.stringify(flat) !== savedSnapshot.current || daysChanged;
  }, [flat, daysOfWeek, dbPlan]);

  const hoursPerQuarter = useMemo(
    () => (dbPlan?.quarters ?? []).map((q) => q.hoursPerWeek),
    [dbPlan],
  );
  const hoursReport = useMemo(
    () => validateHours(flat, hoursPerQuarter.length ? hoursPerQuarter : 0),
    [flat, hoursPerQuarter],
  );
  const liveInvariant = useMemo(
    () => checkInvariants(flat, hoursPerQuarter.length ? hoursPerQuarter : 0),
    [flat, hoursPerQuarter],
  );
  const quarterCounts = useMemo(() => {
    const counts: number[] = [];
    let n = 0;
    for (const l of flat) {
      if (l.rowType === LessonRowType.QUARTER_HEADER) {
        if (counts.length) counts[counts.length - 1] = n;
        counts.push(0);
        n = 0;
        continue;
      }
      n += 1;
    }
    if (counts.length) counts[counts.length - 1] = n;
    return counts;
  }, [flat]);
  const visibleFlat = useMemo(() => {
    if (selectedQuarter === 0) return flat;
    const out: FlatPlan = [];
    let qi = 0;
    for (const l of flat) {
      if (l.rowType === LessonRowType.QUARTER_HEADER) {
        qi += 1;
        if (qi === selectedQuarter) out.push(l);
        continue;
      }
      if (qi === selectedQuarter) out.push(l);
    }
    return out;
  }, [flat, selectedQuarter]);

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
      const hoursPerWeek = hoursPerQuarter[0] ?? dbPlan.quarters[0]?.hoursPerWeek ?? 2;
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
      const path = await generateWordDocument({
        subjectName: subjectName(dbPlan.subjectId, dbPlan.language),
        className: `${dbPlan.grade} класс`,
        hoursPerWeek,
        totalHours: total,
        plan: flat,
        quarterWorkHours,
        sourceLabel: sourceDoc ? sourceDocLabel(sourceDoc) : "Источник не определён",
      });
      setStatus(path ? `Word сохранён: ${total} ч.` : "Экспорт Word отменён.");
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
      const path = kundelik ? await generateKundelikXlsx(flat, fileName) : await generateXlsx(flat, fileName);
      setStatus(path ? `Экспортировано: ${path}` : "Экспорт отменён.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };


  return {
    dbPlan, history, flat, visibleFlat, loading, error, status, toast, busy, daysOfWeek, sourceDoc,
    historyOpen, templateFor, templateName, unfilledQuarter, selectedQuarter, editing, draft, mergeFor, mergeReason,
    setDaysOfWeek, setHistoryOpen, setTemplateFor, setTemplateName, setUnfilledQuarter, setSelectedQuarter, setDraft, setMergeFor, setMergeReason,
    save, recalcSchedule, applyEdit: applyEditFromBlur, commitEdit: applyEdit, cancelEdit, tabNext, beginEdit, doAddHour, doDeleteLesson, doSplit, doAddSor, doMergeObjectivesNext,
    handleDragEnd, updateLesson, confirmMerge, doSaveTemplate, exportWord, exportXlsx,
    hoursReport, liveInvariant, quarterCounts, progress, isDirty
  };
}

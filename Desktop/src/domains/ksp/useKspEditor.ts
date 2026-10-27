import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import type { KspDocument, KspStage, KspStageAssessment, KspStageType, KspValidationReport, ValueComponent } from "../../types";
import { previewReport, STAGE_LABEL } from "./kspModel";

function defaultAssessment(type: KspStageType): KspStageAssessment {
  const summative = type === "sor" || type === "soch";
  const none = type === "greeting" || type === "homework" || type === "reflection"
    || type === "physical_minute" || type === "warmup";
  return {
    mode: summative ? "summative" : none ? "none" : "formative",
    descriptors: [],
    maxPoints: summative ? 10 : null,
    feedbackMethod: "teacher",
  };
}

function emptyStage(type: KspStageType): KspStage {
  return {
    id: crypto.randomUUID(),
    type,
    order: 0,
    durationMinutes: type === "soch" ? 40 : 5,
    teacherActions: "",
    studentActions: "",
    resources: [],
    assessment: defaultAssessment(type),
  };
}

export function useKspEditor(kspId: string) {
  const [doc, setDoc] = useState<KspDocument | null>(null);
  const [report, setReport] = useState<KspValidationReport | null>(null);
  const [values, setValues] = useState<ValueComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const docRef = useRef<KspDocument | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bundle, catalog] = await Promise.all([api.getKspDocument(kspId), api.listValueComponents()]);
      setDoc(bundle.document);
      docRef.current = bundle.document;
      setReport(bundle.report);
      setValues(catalog);
      setDirty(false);
      setOpenStageId(bundle.document.content.stages[0]?.id ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [kspId]);

  useEffect(() => { load(); }, [load]);

  const patchContent = (fn: (d: KspDocument) => KspDocument) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      docRef.current = next;
      return next;
    });
    setDirty(true);
  };

  const save = async (nextStatus?: string) => {
    const current = docRef.current;
    if (!current) return null;
    setSaving(true);
    setError("");
    try {
      const payload = { ...current, status: (nextStatus as KspDocument["status"]) ?? current.status };
      const bundle = await api.saveKspDocument(payload);
      setDoc(bundle.document);
      docRef.current = bundle.document;
      setReport(bundle.report);
      setDirty(false);
      setStatus(bundle.document.status === "draft" && nextStatus && nextStatus !== "draft"
        ? "Сохранено как черновик: закройте замечания, чтобы повысить статус."
        : "Сохранено.");
      return bundle.document;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const rebalance = async () => {
    const current = docRef.current;
    if (!current) return;
    setSaving(true);
    setError("");
    try {
      if (dirty) await api.saveKspDocument(current);
      const bundle = await api.rebalanceKspTime(kspId);
      setDoc(bundle.document);
      docRef.current = bundle.document;
      setReport(bundle.report);
      setDirty(false);
      setStatus("Минуты пересчитаны пропорционально до эталона.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const addStage = (type: KspStageType) => {
    const stage = emptyStage(type);
    patchContent((d) => ({
      ...d,
      content: { ...d.content, stages: [...d.content.stages, stage] },
    }));
    setOpenStageId(stage.id);
  };

  const removeStage = (id: string) => {
    patchContent((d) => ({
      ...d,
      content: { ...d.content, stages: d.content.stages.filter((s) => s.id !== id) },
    }));
  };

  const moveStage = (from: number, to: number) => {
    patchContent((d) => {
      const stages = [...d.content.stages];
      const [item] = stages.splice(from, 1);
      stages.splice(to, 0, item);
      return { ...d, content: { ...d.content, stages } };
    });
  };

  const updateStage = (id: string, patch: Partial<KspStage>) => {
    patchContent((d) => ({
      ...d,
      content: {
        ...d.content,
        stages: d.content.stages.map((s) => {
          if (s.id !== id) return s;
          const typeChanged = Boolean(patch.type && patch.type !== s.type);
          const next: KspStage = {
            ...s,
            ...patch,
            assessment: typeChanged && !patch.assessment
              ? defaultAssessment(patch.type as KspStageType)
              : patch.assessment ?? s.assessment,
          };
          return next;
        }),
      },
    }));
  };

  const requestLeave = () => {
    if (!dirty) return true;
    return window.confirm("Есть несохранённые правки. Уйти без сохранения?");
  };

  const totalMinutes = useMemo(
    () => (doc?.content.stages ?? []).reduce((s, x) => s + (Number(x.durationMinutes) || 0), 0),
    [doc],
  );

  const liveReport = useMemo(() => {
    if (!doc) return report;
    if (!dirty && report) return report;
    return previewReport({
      topic: doc.content.header.topic,
      valuesText: doc.content.header.valuesComponent.text,
      valueIds: doc.content.header.valuesComponent.valueIds,
      homeworkText: doc.content.homework.text,
      homeworkCheck: doc.content.homework.checkMethod,
      lessonDuration: doc.content.lessonDuration,
      objectivesCount: doc.content.header.learningObjectives.length,
      stages: doc.content.stages.map((s) => ({
        id: s.id,
        type: s.type,
        title: STAGE_LABEL[s.type],
        minutes: Number(s.durationMinutes) || 0,
        teacherActions: s.teacherActions,
        studentActions: s.studentActions,
        assessment: s.assessment,
      })),
    });
  }, [doc, dirty, report]);

  return {
    doc, report: liveReport, values, loading, saving, error, status, dirty, openStageId, setOpenStageId,
    totalMinutes, load, save, rebalance, addStage, removeStage, moveStage, updateStage, patchContent,
    requestLeave, stageLabel: STAGE_LABEL,
  };
}

export type KspEditorHook = ReturnType<typeof useKspEditor>;

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import type { KtpPlanCard, TupDocumentListItem } from "../../types";

import { parseGrades } from "../../lib/grades";
import { clonePlanForGrade, listTemplates } from "../../ktp/templateLib";
import type { KtpTemplate } from "../../ktp/templateLib";

export const WEEKDAYS = [
  { num: 1, label: "Пн" },
  { num: 2, label: "Вт" },
  { num: 3, label: "Ср" },
  { num: 4, label: "Чт" },
  { num: 5, label: "Пт" },
  { num: 6, label: "Сб" },
];

export const STATUS_LABEL: Record<string, string> = {
  Draft: "Черновик",
  Validating: "На проверке",
  Approved: "Утверждён",
  Archived: "Архив",
};

export function statusTone(status: string): string {
  switch (status) {
    case "Approved": return "green";
    case "Validating": return "amber";
    case "Archived": return "gray";
    default: return "blue";
  }
}

export function useKtpList(onOpen: (id: string) => void) {
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

  const [templates, setTemplates] = useState<KtpTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [cloneGrade, setCloneGrade] = useState<number | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);

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
  useEffect(() => { setTemplates(listTemplates()); }, []);

  const cloneFromTemplate = async () => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl || cloneGrade == null) return;
    setCloneBusy(true);
    setError("");
    setStatus("Создание КТП из шаблона…");
    try {
      const plan = clonePlanForGrade(tpl, cloneGrade, "2026-2027");
      const saved = await api.saveKtpPlan(plan);
      setStatus(`Клон создан: ${saved.totalHours} уроков.`);
      onOpen(saved.id);
    } catch (e) {
      setError(String(e));
      setStatus("");
    } finally {
      setCloneBusy(false);
    }
  };

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
  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? null;

  const generate = async (docId: string) => {
    if (selectedGrade == null || daysOfWeek.length === 0) return;
    setBusy(true);
    setError("");
    setStatus("Генерация плана из ТУП…");
    try {
      const plan = await api.generateKtpFromTup(docId, selectedGrade, "2026-2027", 2026, daysOfWeek);
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

  return {
    loading, error, status, busy, documents, savedPlans,
    selectedSubject, setSelectedSubject,
    selectedLanguage, setSelectedLanguage,
    selectedGrade, setSelectedGrade,
    selectedDocId, setSelectedDocId,
    daysOfWeek, setDaysOfWeek,
    pendingDoc, setPendingDoc,
    templates, selectedTemplateId, setSelectedTemplateId,
    cloneGrade, setCloneGrade, cloneBusy,
    cloneFromTemplate, generate,
    subjects, languages, gradeOptions, candidateDocs, canGenerate, selectedDoc
  };
}

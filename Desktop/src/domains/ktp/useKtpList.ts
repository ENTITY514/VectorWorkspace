import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import type { KtpPlanCard, TupDocumentDetail, TupDocumentListItem } from "../../types";
import { parseGrades } from "../../lib/grades";
import { clonePlanForGrade, deleteTemplate, listTemplates } from "../../ktp/templateLib";
import type { KtpTemplate } from "../../ktp/templateLib";
import { QUARTER_WEEKS } from "../../ktp/hoursValidation";
import { hoursPerWeekForGrade } from "../../ktp/fromDb";
import { normalizeDirection } from "../tup/labels";
import { defaultAcademicYear, filterKtpPlans, startYearOf } from "./ktpListModel";

export {
  WEEKDAYS,
  STATUS_LABEL,
  academicYearOptions,
  defaultAcademicYear,
  filterKtpPlans,
  startYearOf,
  statusTone,
} from "./ktpListModel";

export const YEAR_WEEKS = QUARTER_WEEKS.reduce((s, n) => s + n, 0);

const DAYS_KEY = "vw_ktp_days";
const YEAR_KEY = "vw_ktp_year";

function readStoredDays(): number[] {
  try {
    const raw = sessionStorage.getItem(DAYS_KEY);
    if (!raw) return [2, 4];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [2, 4];
    const days = arr.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 6);
    return days.length > 0 ? days : [2, 4];
  } catch {
    return [2, 4];
  }
}

function readStoredYear(): string {
  try {
    return sessionStorage.getItem(YEAR_KEY) || defaultAcademicYear();
  } catch {
    return defaultAcademicYear();
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
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(readStoredDays);
  const [academicYear, setAcademicYear] = useState<string>(readStoredYear);
  const [pendingDoc, setPendingDoc] = useState<TupDocumentListItem | null>(null);
  const [hoursPerWeek, setHoursPerWeek] = useState<number | null>(null);

  const [templates, setTemplates] = useState<KtpTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [cloneGrade, setCloneGrade] = useState<number | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);

  const [listQuery, setListQuery] = useState("");
  const [listGrade, setListGrade] = useState<number | null>(null);
  const [listStatus, setListStatus] = useState("");
  const [listYear, setListYear] = useState("");

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
  useEffect(() => { sessionStorage.setItem(DAYS_KEY, JSON.stringify(daysOfWeek)); }, [daysOfWeek]);
  useEffect(() => { sessionStorage.setItem(YEAR_KEY, academicYear); }, [academicYear]);

  useEffect(() => {
    if (!selectedDocId || selectedGrade == null) {
      setHoursPerWeek(null);
      return;
    }
    let cancelled = false;
    api.fetchTupDocument(selectedDocId)
      .then((d: TupDocumentDetail) => {
        if (!cancelled) setHoursPerWeek(hoursPerWeekForGrade(d, selectedGrade) || null);
      })
      .catch(() => { if (!cancelled) setHoursPerWeek(null); });
    return () => { cancelled = true; };
  }, [selectedDocId, selectedGrade]);

  const cloneFromTemplate = async () => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl || cloneGrade == null) return;
    setCloneBusy(true);
    setError("");
    setStatus("Создание КТП из шаблона…");
    try {
      const plan = clonePlanForGrade(tpl, cloneGrade, academicYear);
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

  const removeTemplate = (id: string) => {
    setTemplates(deleteTemplate(id));
    if (selectedTemplateId === id) setSelectedTemplateId("");
  };

  const deletePlan = async (id: string) => {
    setError("");
    try {
      await api.deleteKtpPlan(id);
      setSavedPlans((prev) => prev.filter((p) => p.id !== id));
      setStatus("План удалён.");
    } catch (e) {
      setError(String(e));
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
    return documents
      .filter((d) => {
        if (d.subjectName !== selectedSubject || d.language !== selectedLanguage) return false;
        return parseGrades(d.targetGrades).includes(selectedGrade);
      })
      .sort((a, b) => {
        const rank = (d: TupDocumentListItem) => {
          switch (normalizeDirection(d.directionStr)) {
            case "emn": return 0;
            case "common": return 1;
            default: return 2;
          }
        };
        return rank(a) - rank(b);
      });
  }, [documents, selectedSubject, selectedLanguage, selectedGrade]);

  useEffect(() => {
    if (candidateDocs.length === 0) {
      if (selectedDocId) setSelectedDocId("");
      return;
    }
    const stillValid = candidateDocs.some((d) => d.id === selectedDocId);
    if (stillValid) return;
    const emn = candidateDocs.find((d) => normalizeDirection(d.directionStr) === "emn");
    setSelectedDocId((emn ?? candidateDocs[0]).id);
  }, [candidateDocs, selectedDocId]);

  const canGenerate = Boolean(selectedDocId) && selectedGrade != null && daysOfWeek.length > 0;
  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? null;
  const expectedHours = hoursPerWeek != null ? hoursPerWeek * YEAR_WEEKS : null;

  const duplicates = useMemo(() => {
    if (!selectedDoc || selectedGrade == null) return [];
    return savedPlans.filter(
      (p) =>
        p.subjectId === selectedDoc.subjectId &&
        p.grade === selectedGrade &&
        p.language === selectedDoc.language &&
        p.academicYear === academicYear,
    );
  }, [savedPlans, selectedDoc, selectedGrade, academicYear]);

  const filteredPlans = useMemo(
    () => filterKtpPlans(savedPlans, { query: listQuery, grade: listGrade, status: listStatus, year: listYear }),
    [savedPlans, listQuery, listGrade, listStatus, listYear],
  );

  const stats = useMemo(() => ({
    total: savedPlans.length,
    drafts: savedPlans.filter((p) => p.status === "Draft").length,
    approved: savedPlans.filter((p) => p.status === "Approved").length,
    hours: savedPlans.reduce((s, p) => s + (p.totalHours || 0), 0),
  }), [savedPlans]);

  const listGrades = useMemo(
    () => Array.from(new Set(savedPlans.map((p) => p.grade))).sort((a, b) => a - b),
    [savedPlans],
  );
  const listYears = useMemo(
    () => Array.from(new Set(savedPlans.map((p) => p.academicYear))).sort(),
    [savedPlans],
  );

  const generate = async (docId: string) => {
    if (selectedGrade == null || daysOfWeek.length === 0) return;
    setBusy(true);
    setError("");
    setStatus("Генерация плана из ТУП…");
    try {
      const plan = await api.generateKtpFromTup(docId, selectedGrade, academicYear, startYearOf(academicYear), daysOfWeek);
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
    loading, error, status, busy, documents, savedPlans, filteredPlans, stats,
    selectedSubject, setSelectedSubject,
    selectedLanguage, setSelectedLanguage,
    selectedGrade, setSelectedGrade,
    selectedDocId, setSelectedDocId,
    daysOfWeek, setDaysOfWeek,
    academicYear, setAcademicYear,
    pendingDoc, setPendingDoc,
    hoursPerWeek, expectedHours, duplicates,
    templates, selectedTemplateId, setSelectedTemplateId,
    cloneGrade, setCloneGrade, cloneBusy,
    cloneFromTemplate, removeTemplate, deletePlan, generate, loadAll, openPlan: onOpen,
    listQuery, setListQuery, listGrade, setListGrade,
    listStatus, setListStatus, listYear, setListYear,
    listGrades, listYears,
    subjects, languages, gradeOptions, candidateDocs, canGenerate, selectedDoc,
  };
}

export type KtpListHook = ReturnType<typeof useKtpList>;

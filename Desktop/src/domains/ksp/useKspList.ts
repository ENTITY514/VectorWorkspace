import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { subjectName } from "../../panels/SubjectNames";
import type { KspCard, KspLessonOffer } from "../../types";
import { exportKspById, type KspExportFormat } from "./kspExport";
import { sortKspCards, type KspSortKey, type SortDir } from "./kspModel";

export function useKspList(onCreate: (id: string) => void) {
  const [cards, setCards] = useState<KspCard[]>([]);
  const [offers, setOffers] = useState<KspLessonOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [createQuery, setCreateQuery] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [sortKey, setSortKey] = useState<KspSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [className, setClassName] = useState("");
  const [duration, setDuration] = useState(45);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [docs, lessons] = await Promise.all([api.listKspDocuments(), api.listKspLessonOffers()]);
      setCards(docs);
      setOffers(lessons);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const o of offers) if (o.subjectId) set.add(o.subjectId);
    for (const c of cards) if (c.subjectId) set.add(c.subjectId);
    return Array.from(set).sort();
  }, [offers, cards]);

  const grades = useMemo(() => {
    const set = new Set<number>();
    for (const o of offers) set.add(o.grade);
    for (const c of cards) set.add(c.grade);
    return Array.from(set).sort((a, b) => a - b);
  }, [offers, cards]);

  const filteredOffers = useMemo(() => {
    const q = createQuery.trim().toLowerCase();
    return offers.filter((o) => {
      if (o.hasKsp) return false;
      if (grade != null && o.grade !== grade) return false;
      if (subject && o.subjectId !== subject) return false;
      if (!q) return true;
      const name = subjectName(o.subjectId, o.language).toLowerCase();
      return `${name} ${o.topicTitle} ${o.sectionName} ${o.globalIndex}`.toLowerCase().includes(q);
    });
  }, [offers, createQuery, grade, subject]);

  const filteredCards = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    const filtered = cards.filter((c) => {
      if (grade != null && c.grade !== grade) return false;
      if (subject && c.subjectId !== subject) return false;
      if (status && c.status !== status) return false;
      if (!q) return true;
      const name = subjectName(c.subjectId, c.language).toLowerCase();
      return `${name} ${c.topic} ${c.section} ${c.className} ${c.globalIndex}`.toLowerCase().includes(q);
    });
    return sortKspCards(filtered, sortKey, sortDir);
  }, [cards, listQuery, grade, subject, status, sortKey, sortDir]);

  const stats = useMemo(() => ({
    total: cards.length,
    drafts: cards.filter((c) => c.status === "draft").length,
    ready: cards.filter((c) => c.status === "ready" || c.status === "approved").length,
    freeLessons: offers.filter((o) => !o.hasKsp).length,
  }), [cards, offers]);

  const toggleSort = (key: KspSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" || key === "updated" ? "desc" : "asc");
    }
  };

  const create = async () => {
    if (!selectedLessonId) return;
    setBusy(true);
    setError("");
    try {
      const bundle = await api.createKspFromLesson(selectedLessonId, className || undefined, duration);
      onCreate(bundle.document.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportCard = async (id: string, format: KspExportFormat) => {
    setError("");
    try {
      await exportKspById(id, format);
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await api.deleteKspDocument(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(String(e));
    }
  };

  return {
    loading, busy, error, cards, offers, filteredOffers, filteredCards, stats,
    listQuery, setListQuery, createQuery, setCreateQuery,
    grade, setGrade, subject, setSubject, status, setStatus,
    sortKey, sortDir, toggleSort,
    selectedLessonId, setSelectedLessonId, className, setClassName,
    duration, setDuration, subjects, grades, create, remove, exportCard, load,
  };
}

export type KspListHook = ReturnType<typeof useKspList>;

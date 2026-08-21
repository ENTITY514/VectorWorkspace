import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import type { TupDocumentListItem, TupSearchHit } from "../../types";
import { parseGrades } from "../../lib/grades";

export function useTupList(onSelect: (id: string) => void) {
  const [documents, setDocuments] = useState<TupDocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => sessionStorage.getItem("tup-language") ?? "all");

  const [ftsQuery, setFtsQuery] = useState("");
  const [ftsHits, setFtsHits] = useState<TupSearchHit[]>([]);
  const [ftsLoading, setFtsLoading] = useState(false);
  const [ftsError, setFtsError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<"subjectName" | "targetGrades" | "objectiveCount" | "orderDate">("subjectName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    const q = ftsQuery.trim();
    if (!q) {
      setFtsHits([]);
      setFtsError(null);
      return;
    }
    setFtsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await api.searchTup(q, 50);
        setFtsHits(hits);
        setFtsError(null);
      } catch (e) {
        setFtsError(String(e));
        setFtsHits([]);
      } finally {
        setFtsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ftsQuery]);

  useEffect(() => {
    sessionStorage.setItem("tup-language", selectedLanguage);
  }, [selectedLanguage]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.subjectName) set.add(d.subjectName);
    }
    return ["all", ...Array.from(set).sort()];
  }, [documents]);

  const directions = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.directionStr) set.add(d.directionStr);
    }
    return ["all", ...Array.from(set)];
  }, [documents]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.language) set.add(d.language);
    }
    return ["all", ...Array.from(set).sort()];
  }, [documents]);

  const gradeSet = useMemo(() => {
    const set = new Set<number>();
    for (const d of documents) {
      for (const g of parseGrades(d.targetGrades)) {
        set.add(g);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [documents]);

  const filteredAndSorted = useMemo(() => {
    let result = [...documents];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        d => d.subjectName?.toLowerCase().includes(q) ||
              String(d.appendixNumber).includes(q) ||
              d.targetGrades.includes(String(q))
      );
    }

    if (selectedSubject !== "all") result = result.filter(d => d.subjectName === selectedSubject);
    if (selectedDirection !== "all") result = result.filter(d => d.directionStr === selectedDirection);
    if (selectedLanguage !== "all") result = result.filter(d => d.language === selectedLanguage);

    if (selectedGrades.length > 0) {
      result = result.filter(d => {
        const docGrades = parseGrades(d.targetGrades);
        return docGrades.some(g => selectedGrades.includes(g));
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      const nameA = a.subjectName ?? "";
      const nameB = b.subjectName ?? "";

      switch (sortField) {
        case "subjectName": cmp = nameA.localeCompare(nameB); break;
        case "targetGrades": cmp = String(a.targetGrades || "").localeCompare(String(b.targetGrades || "")); break;
        case "objectiveCount": cmp = Number(a.objectiveCount ?? 0) - Number(b.objectiveCount ?? 0); break;
        case "orderDate": cmp = new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [documents, searchQuery, selectedSubject, selectedGrades, selectedDirection, selectedLanguage, sortField, sortDir]);

  const stats = useMemo(() => {
    const totalDocs = documents.length;
    const totalObjectives = documents.reduce((s, d) => s + d.objectiveCount, 0);
    const uniqueSubjects = new Set(documents.map(d => d.subjectName)).size;
    return { totalDocs, totalObjectives, uniqueSubjects };
  }, [documents]);

  return {
    loading, error, documents, ftsQuery, setFtsQuery, ftsHits, ftsLoading, ftsError,
    searchQuery, setSearchQuery, selectedSubject, setSelectedSubject,
    selectedGrades, setSelectedGrades, selectedDirection, setSelectedDirection,
    selectedLanguage, setSelectedLanguage, sortField, setSortField,
    sortDir, setSortDir, subjects, directions, languages, gradeSet,
    filteredAndSorted, stats, onSelect
  };
}

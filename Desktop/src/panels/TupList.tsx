import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { TupDocumentListItem, TupSearchHit } from "../types";
import { SUBJECT_NAMES } from "./SubjectNames";

function parseGrades(targetGrades: string): number[] {
  if (!targetGrades) return [];
  if (targetGrades.includes("-")) {
    const [lo, hi] = targetGrades.split("-").map((s) => Number(s.trim()));
    if (!isNaN(lo) && !isNaN(hi)) {
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
  }
  const single = Number(targetGrades.trim());
  return !isNaN(single) ? [single] : [];
}

export function TupList({ onSelect }: { onSelect: (id: string) => void }) {
  const [documents, setDocuments] = useState<TupDocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Поиск и фильтры
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => sessionStorage.getItem("tup-language") ?? "all");

  // Полнотекстовый поиск по содержимому ТУП (FTS5)
  const [ftsQuery, setFtsQuery] = useState("");
  const [ftsHits, setFtsHits] = useState<TupSearchHit[]>([]);
  const [ftsLoading, setFtsLoading] = useState(false);
  const [ftsError, setFtsError] = useState<string | null>(null);

  // Сортировка
  const [sortField, setSortField] = useState<"subjectName" | "targetGrades" | "objectiveCount" | "orderDate">("subjectName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Загрузка списка
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

  // Полнотекстовый поиск с задержкой (debounce) по содержимому ТУП.
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

  // Получаем уникальные предметы
  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.subjectName) set.add(d.subjectName);
    }
    return ["all", ...Array.from(set).sort()];
  }, [documents]);

  // Получаем уникальные направления
  const directions = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.directionStr && d.directionStr !== "common") set.add(d.directionStr);
    }
    return ["all", ...Array.from(set)];
  }, [documents]);

  // Получаем уникальные языки обучения
  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.language) set.add(d.language);
    }
    return ["all", ...Array.from(set).sort()];
  }, [documents]);

  // Сохраняем выбранный язык в sessionStorage, чтобы он не сбрасывался
  useEffect(() => {
    sessionStorage.setItem("tup-language", selectedLanguage);
  }, [selectedLanguage]);

  // Получаем уникальные классы
  const gradeSet = useMemo(() => {
    const set = new Set<number>();
    for (const d of documents) {
      for (const g of parseGrades(d.targetGrades)) {
        set.add(g);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [documents]);

  // Фильтрация и сортировка
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

    if (selectedSubject !== "all") {
      result = result.filter(d => d.subjectName === selectedSubject);
    }

    if (selectedDirection !== "all") {
      result = result.filter(d => d.directionStr === selectedDirection);
    }

    if (selectedLanguage !== "all") {
      result = result.filter(d => d.language === selectedLanguage);
    }

    if (selectedGrades.length > 0) {
      result = result.filter(d => {
        const docGrades = parseGrades(d.targetGrades);
        return docGrades.some(g => selectedGrades.includes(g));
      });
    }

    // Сортировка
    result.sort((a, b) => {
      let cmp = 0;

      const nameA = a.subjectName ?? "";
      const nameB = b.subjectName ?? "";

      switch (sortField) {
        case "subjectName":
          cmp = nameA.localeCompare(nameB);
          break;
        case "targetGrades": {
          const gradesStrA = String(a.targetGrades || "");
          const gradesStrB = String(b.targetGrades || "");
          cmp = gradesStrA.localeCompare(gradesStrB);
          break;
        }
        case "objectiveCount": {
          const countA = Number(a.objectiveCount ?? 0);
          const countB = Number(b.objectiveCount ?? 0);
          cmp = countA - countB;
          break;
        }
        case "orderDate": {
          const dateA = new Date(a.orderDate).getTime();
          const dateB = new Date(b.orderDate).getTime();
          cmp = dateA - dateB;
          break;
        }
      }

      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [documents, searchQuery, selectedSubject, selectedGrades, selectedDirection, selectedLanguage, sortField, sortDir]);

  // Статистика
  const stats = useMemo(() => {
    const totalDocs = documents.length;
    const totalObjectives = documents.reduce((s, d) => s + d.objectiveCount, 0);
    return { totalDocs, totalObjectives };
  }, [documents]);

  if (loading) {
    return <div className="empty">Загрузка документов ТУП...</div>;
  }

  return (
    <>
      {/* Статистика */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Документов ТУП" value={String(stats.totalDocs)} />
        <Stat label="Целей обучения" value={String(stats.totalObjectives)} />
        <Stat label="Предметов" value={String(new Set(documents.map((d) => d.subjectName)).size)} />
        <Stat label="Статус базы" value={loading ? "загрузка" : "готово"} tone={error ? "red" : "green"} />
      </div>

      {/* Панель */}
      <Panel title="Нормативный базис — ТУП" subtitle="Типовые учебные программы: документы и цели обучения">
        <div className="panel-body">
          {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}

          {/* Поиск по названию документа */}
          <div className="search-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Поиск по предмету, приложению..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Полнотекстовый поиск по содержимому (цели, разделы, темы, задачи) */}
          <div className="search-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Полнотекстовый поиск: цель, тема, раздел (FTS5)..."
              value={ftsQuery}
              onChange={(e) => setFtsQuery(e.target.value)}
              className="search-input"
            />
            {ftsLoading && <span className="search-hint">поиск…</span>}
          </div>
          {ftsError && <div className="flash-error" style={{ marginBottom: 12 }}>{ftsError}</div>}
          {ftsQuery.trim() && !ftsLoading && ftsHits.length > 0 && (
            <div className="fts-results" style={{ marginBottom: 16 }}>
              <div className="fts-results-title">Найдено в содержимом: {ftsHits.length}</div>
              {ftsHits.slice(0, 20).map((h, i) => (
                <button
                  key={`${h.entityType}-${h.entityId}-${i}`}
                  className="fts-hit"
                  onClick={() => onSelect(h.documentId)}
                >
                  <span className={`doc-badge fts-badge-${h.entityType}`}>{h.entityType}</span>
                  <span className="fts-text">{h.text}</span>
                  <span className="fts-meta">
                    {SUBJECT_NAMES[h.subjectId] ?? h.subjectId} · {h.targetGrades} · {h.language.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Фильтры */}
          <div className="filter-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {/* Предмет */}
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="filter-select"
              style={{ minWidth: 200 }}
            >
              {subjects.map((s) => (
                <option key={s} value={s}>{s === "all" ? "Все предметы" : s}</option>
              ))}
            </select>

            {/* Направление */}
            <select
              value={selectedDirection}
              onChange={(e) => setSelectedDirection(e.target.value)}
              className="filter-select"
              style={{ minWidth: 120 }}
            >
              {directions.map((d) => (
                <option key={d} value={d}>{d === "all" ? "Все направления" : d}</option>
              ))}
            </select>

            {/* Язык обучения */}
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="filter-select"
              style={{ minWidth: 120 }}
            >
              {languages.map((l) => (
                <option key={l} value={l}>{l === "all" ? "Все языки" : l.toUpperCase()}</option>
              ))}
            </select>

            {/* Классы */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 200 }}>
              {gradeSet.map((g) => (
                <button
                  key={g}
                  className={`btn btn-sm ${selectedGrades.includes(g) ? "btn-primary" : ""}`}
                  onClick={() => {
                    setSelectedGrades(prev =>
                      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
                    );
                  }}
                >
                  {g} кл.
                </button>
              ))}
            </div>

            {/* Сортировка */}
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="filter-select"
              style={{ minWidth: 140 }}
            >
              <option value="subjectName">По названию</option>
              <option value="targetGrades">По классам</option>
              <option value="objectiveCount">По целям ↑↓</option>
              <option value="orderDate">По дате приказа</option>
            </select>

            <button
              className={`btn btn-sm ${sortDir === "asc" ? "btn-primary" : ""}`}
              onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
              title="Направление сортировки"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>

          {/* Список документов */}
          {filteredAndSorted.length === 0 ? (
            <div className="empty">Ничего не найдено. Попробуйте изменить фильтры.</div>
          ) : (
            <div className="list-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {filteredAndSorted.map((d) => (
                <DocumentCard key={d.id} doc={d} onClick={() => onSelect(d.id)} />
              ))}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

function DocumentCard({ doc, onClick }: { doc: TupDocumentListItem; onClick: () => void }) {
  const dirClass = doc.directionStr === "ЕМН" ? "doc-badge-emn" : doc.directionStr === "ОГН" ? "doc-badge-ogn" : "";
  const langClass = doc.language === "kz" ? "doc-badge-kz" : "doc-badge-ru";
  return (
    <button className="doc-card" onClick={onClick}>
      <div className="doc-card-header">
        <span className="doc-subject">{doc.subjectName}</span>
        <span style={{ display: "flex", gap: 4 }}>
          <span className={`doc-badge ${langClass}`}>{doc.language?.toUpperCase() ?? "RU"}</span>
          <span className={`doc-badge ${dirClass}`}>
            {doc.directionStr}
          </span>
        </span>
      </div>
      <div className="doc-card-body">
        <div className="doc-grades">{doc.targetGrades}</div>
        <div className="doc-meta">
          Прил. {doc.appendixNumber} · {doc.orderDate}
        </div>
        <div className="doc-stats">
          <span>{doc.objectiveCount} целей</span>
          {doc.hasDsp && <span className="dsp-badge">ДСП</span>}
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

import { Panel } from "../../../components/ui";
import { Stat } from "../../../shared/ui/Stat";
import { SUBJECT_NAMES } from "../../../panels/SubjectNames";
import { useTupList } from "../useTupList";
import { TupDocumentCard } from "./TupDocumentCard";

export function TupList({ onSelect }: { onSelect: (id: string) => void }) {
  const hook = useTupList(onSelect);
  const {
    loading, error, ftsQuery, setFtsQuery, ftsHits, ftsLoading, ftsError,
    searchQuery, setSearchQuery, selectedSubject, setSelectedSubject,
    selectedGrades, setSelectedGrades, selectedDirection, setSelectedDirection,
    selectedLanguage, setSelectedLanguage, sortField, setSortField,
    sortDir, setSortDir, subjects, directions, languages, gradeSet,
    filteredAndSorted, stats
  } = hook;

  if (loading) return <div className="empty">Загрузка документов ТУП...</div>;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Документов ТУП" value={String(stats.totalDocs)} />
        <Stat label="Целей обучения" value={String(stats.totalObjectives)} />
        <Stat label="Предметов" value={String(stats.uniqueSubjects)} />
        <Stat label="Статус базы" value="готово" />
      </div>

      <Panel title="Нормативный базис — ТУП" subtitle="Типовые учебные программы: документы и цели обучения">
        <div className="panel-body">
          {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="search-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Поиск по предмету, приложению..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

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

          <div className="filter-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} className="filter-select" style={{ minWidth: 200 }}>
              {subjects.map((s) => <option key={s} value={s}>{s === "all" ? "Все предметы" : s}</option>)}
            </select>

            <select value={selectedDirection} onChange={(e) => setSelectedDirection(e.target.value)} className="filter-select" style={{ minWidth: 120 }}>
              {directions.map((d) => <option key={d} value={d}>{d === "all" ? "Все направления" : d}</option>)}
            </select>

            <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} className="filter-select" style={{ minWidth: 120 }}>
              {languages.map((l) => <option key={l} value={l}>{l === "all" ? "Все языки" : l.toUpperCase()}</option>)}
            </select>

            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 200 }}>
              {gradeSet.map((g) => (
                <button
                  key={g}
                  className={`btn btn-sm ${selectedGrades.includes(g) ? "btn-primary" : ""}`}
                  onClick={() => setSelectedGrades((prev: number[]) => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                >
                  {g} кл.
                </button>
              ))}
            </div>

            <select value={sortField} onChange={(e) => setSortField(e.target.value as any)} className="filter-select" style={{ minWidth: 140 }}>
              <option value="subjectName">По названию</option>
              <option value="targetGrades">По классам</option>
              <option value="objectiveCount">По целям ↑↓</option>
              <option value="orderDate">По дате приказа</option>
            </select>

            <button
              className={`btn btn-sm ${sortDir === "asc" ? "btn-primary" : ""}`}
              onClick={() => setSortDir((d: "asc" | "desc") => d === "asc" ? "desc" : "asc")}
              title="Направление сортировки"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>

          {filteredAndSorted.length === 0 ? (
            <div className="empty">Ничего не найдено. Попробуйте изменить фильтры.</div>
          ) : (
            <div className="list-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {filteredAndSorted.map((d) => (
                <TupDocumentCard key={d.id} doc={d} onClick={() => onSelect(d.id)} />
              ))}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

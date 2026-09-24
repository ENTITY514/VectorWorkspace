import { subjectName } from "../../../panels/SubjectNames";
import { languageLabel } from "../../tup/labels";
import { formatKspDate, STATUS_LABEL, statusTone, type KspSortKey } from "../kspModel";
import type { KspListHook } from "../useKspList";

const COLS: { key: KspSortKey; label: string }[] = [
  { key: "subject", label: "Предмет" },
  { key: "grade", label: "Класс" },
  { key: "index", label: "№" },
  { key: "topic", label: "Тема" },
  { key: "date", label: "Дата" },
  { key: "status", label: "Статус" },
];

export function KspCatalog({
  hook,
  onView,
  onEdit,
}: {
  hook: KspListHook;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const {
    loading, filteredCards, cards, stats, listQuery, setListQuery,
    grade, setGrade, subject, setSubject, status, setStatus,
    subjects, grades, sortKey, sortDir, toggleSort, remove, exportCard,
  } = hook;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Сохранённые планы
          {cards.length > 0 && (
            <span className="muted"> ({filteredCards.length} из {cards.length})</span>
          )}
        </h3>
      </div>
      <div className="ktp-list-toolbar">
        <input className="search-input" placeholder="Поиск по каталогу: предмет, тема, класс…" value={listQuery} onChange={(e) => setListQuery(e.target.value)} />
        <select className="filter-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Все предметы</option>
          {subjects.map((s) => <option key={s} value={s}>{subjectName(s)}</option>)}
        </select>
        <select className="filter-select" value={grade ?? ""} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Все классы</option>
          {grades.map((g) => <option key={g} value={g}>{g} класс</option>)}
        </select>
        <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {loading ? <div className="empty">Загрузка…</div> : filteredCards.length === 0 ? (
        <div className="empty ksp-empty">
          {stats.total === 0
            ? "КСП ещё нет. Выберите урок КТП выше — откроется каркас по приказу № 130."
            : "Нет планов по выбранным фильтрам."}
        </div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key}>
                  <button
                    type="button"
                    className={`ksp-th-sort${sortKey === c.key ? " active" : ""}`}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}{sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.map((c) => (
              <tr key={c.id} className="ktp-plan-row" onClick={() => onView(c.id)}>
                <td>{subjectName(c.subjectId, c.language)} · {languageLabel(c.language)}</td>
                <td>{c.className || `${c.grade}`}</td>
                <td>{c.globalIndex}</td>
                <td>{c.topic}</td>
                <td>{formatKspDate(c.plannedDate)}</td>
                <td><span className={`badge badge-${statusTone(c.status)}`}>{STATUS_LABEL[c.status]}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row gap-sm ksp-row-actions">
                    <button className="btn btn-sm" onClick={() => onView(c.id)}>Просмотр</button>
                    <button className="btn btn-sm btn-primary" onClick={() => onEdit(c.id)}>Править</button>
                    <button className="btn btn-sm" onClick={() => exportCard(c.id, "docx")}>Word</button>
                    <button className="btn btn-sm" onClick={() => exportCard(c.id, "xlsx")}>Excel</button>
                    <button className="btn btn-sm" onClick={() => exportCard(c.id, "pdf")}>PDF</button>
                    <button className="btn btn-sm btn-danger" onClick={() => {
                      if (window.confirm(`Удалить КСП «${c.topic}»?`)) remove(c.id);
                    }}>Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

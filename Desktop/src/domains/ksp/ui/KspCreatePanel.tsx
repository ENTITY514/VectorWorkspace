import { subjectName } from "../../../panels/SubjectNames";
import type { KspListHook } from "../useKspList";

export function KspCreatePanel({ hook }: { hook: KspListHook }) {
  const {
    filteredOffers, createQuery, setCreateQuery,
    selectedLessonId, setSelectedLessonId, className, setClassName,
    duration, setDuration, create, busy, offers,
  } = hook;

  return (
    <div className="panel ksp-create-panel">
      <div className="panel-head"><h3>Создать из урока КТП</h3></div>
      <div className="panel-body">
        <div className="ktp-list-toolbar">
          <input
            className="search-input"
            placeholder="Найти урок без КСП: тема, предмет, номер…"
            value={createQuery}
            onChange={(e) => setCreateQuery(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <select className="filter-select ksp-offer-select" value={selectedLessonId} onChange={(e) => setSelectedLessonId(e.target.value)}>
            <option value="">Урок КТП без КСП…</option>
            {filteredOffers.slice(0, 200).map((o) => (
              <option key={o.lessonId} value={o.lessonId}>
                {subjectName(o.subjectId, o.language)} · {o.grade} кл. · №{o.globalIndex} {o.topicTitle}
              </option>
            ))}
          </select>
          <input className="filter-select ksp-class-input" placeholder="Класс" value={className} onChange={(e) => setClassName(e.target.value)} />
          <select className="filter-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={45}>45 мин</option>
            <option value={40}>40 мин</option>
            <option value={35}>35 мин</option>
            <option value={90}>90 мин</option>
          </select>
          <button className="btn btn-primary btn-sm" disabled={busy || !selectedLessonId} onClick={create}>
            {busy ? "…" : "Создать и открыть"}
          </button>
        </div>
        <div className="muted ksp-create-hint">
          {offers.length === 0
            ? "Сначала создайте КТП — краткосрочный план строится из урока календарно-тематического плана."
            : "Тема, раздел и цели подставятся из КТП. Поиск выше не трогает таблицу сохранённых планов."}
        </div>
      </div>
    </div>
  );
}

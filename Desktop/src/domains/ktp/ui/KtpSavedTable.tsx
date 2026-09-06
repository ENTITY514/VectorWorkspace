import { subjectName } from "../../../panels/SubjectNames";
import { languageLabel } from "../../tup/labels";
import { STATUS_LABEL, statusTone, WEEKDAYS, type KtpListHook } from "../useKtpList";

export function KtpSavedTable({ hook, onOpen }: { hook: KtpListHook; onOpen: (id: string) => void }) {
  const {
    savedPlans, filteredPlans, deletePlan,
    listQuery, setListQuery, listGrade, setListGrade,
    listStatus, setListStatus, listYear, setListYear,
    listGrades, listYears,
  } = hook;

  const hasFilters = Boolean(listQuery || listGrade != null || listStatus || listYear);
  const clearFilters = () => {
    setListQuery("");
    setListGrade(null);
    setListStatus("");
    setListYear("");
  };

  const dayLabel = (raw: string) =>
    raw
      ? raw.split(",").map((d) => WEEKDAYS[Number(d) - 1]?.label ?? d).join(", ")
      : "—";

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>
          Сохранённые планы
          {savedPlans.length > 0 && (
            <span className="muted">
              {" "}({hasFilters ? `${filteredPlans.length} из ${savedPlans.length}` : savedPlans.length})
            </span>
          )}
        </h3>
      </div>
      {savedPlans.length > 0 && (
        <div className="ktp-list-toolbar">
          <input
            className="search-input"
            placeholder="Поиск: предмет, класс, год…"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
          />
          <select
            className="filter-select"
            value={listGrade ?? ""}
            onChange={(e) => setListGrade(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Все классы</option>
            {listGrades.map((g) => <option key={g} value={g}>{g} класс</option>)}
          </select>
          <select
            className="filter-select"
            value={listStatus}
            onChange={(e) => setListStatus(e.target.value)}
          >
            <option value="">Все статусы</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={listYear}
            onChange={(e) => setListYear(e.target.value)}
          >
            <option value="">Все годы</option>
            {listYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {hasFilters && (
            <button className="btn btn-sm" onClick={clearFilters}>Сбросить</button>
          )}
        </div>
      )}
      <div className="panel-body" style={{ padding: 0 }}>
        {savedPlans.length === 0 ? (
          <div className="empty" style={{ padding: 28 }}>
            Планов пока нет. Выберите предмет, язык и класс выше — и нажмите «Сгенерировать и открыть».
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            Нет планов по выбранным фильтрам.{" "}
            <button className="btn btn-sm" onClick={clearFilters}>Сбросить фильтры</button>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Предмет</th>
                <th>Класс</th>
                <th>Язык</th>
                <th>Учебный год</th>
                <th>Часов</th>
                <th>Статус</th>
                <th>Дни</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.map((p) => (
                <tr key={p.id} className="ktp-plan-row" onClick={() => onOpen(p.id)}>
                  <td>{subjectName(p.subjectId, p.language)}</td>
                  <td>{p.grade} класс</td>
                  <td>{languageLabel(p.language)}</td>
                  <td>{p.academicYear}</td>
                  <td>{p.totalHours}</td>
                  <td>
                    <span className={`badge badge-${statusTone(p.status)}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td>{dayLabel(p.daysOfWeek)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row gap-sm">
                      <button className="btn btn-sm btn-primary" onClick={() => onOpen(p.id)}>
                        Открыть
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (window.confirm(`Удалить КТП «${subjectName(p.subjectId, p.language)}», ${p.grade} класс?`)) {
                            deletePlan(p.id);
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { SUBJECT_NAMES } from "../../../panels/SubjectNames";
import { STATUS_LABEL, statusTone, WEEKDAYS } from "../useKtpList";

export function KtpSavedTable({ hook, onOpen }: { hook: any; onOpen: (id: string) => void }) {
  const { savedPlans } = hook;
  
  const subjectName = (id: string) => SUBJECT_NAMES[id] ?? id;
  const languageName = (lang: string) => (lang === "KK" ? "Қазақша" : lang === "RU" ? "Русский" : lang || "—");

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>Сохранённые планы ({savedPlans.length})</h3>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {savedPlans.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            Планов пока нет — создайте первый КТП из документа ТУП.
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
              {savedPlans.map((p: any) => (
                <tr key={p.id}>
                  <td>{subjectName(p.subjectId)}</td>
                  <td>{p.grade} класс</td>
                  <td>{languageName(p.language)}</td>
                  <td>{p.academicYear}</td>
                  <td>{p.totalHours}</td>
                  <td>
                    <span className={`badge badge-${statusTone(p.status)}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td>{p.daysOfWeek ? p.daysOfWeek.split(",").map((d: string) => WEEKDAYS[Number(d) - 1]?.label ?? d).join(", ") : "—"}</td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => onOpen(p.id)}>
                      Открыть
                    </button>
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

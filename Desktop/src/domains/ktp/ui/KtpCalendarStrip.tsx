import { formatShortDate } from "../../../ktp/hoursValidation";
import { LessonRowType, type KtpPlan } from "../../../ktp/model/types";

export function KtpCalendarStrip({ flat }: { flat: KtpPlan }) {
  const dates = flat
    .filter((l) => l.rowType !== LessonRowType.QUARTER_HEADER && l.date)
    .map((l) => l.date);
  const unique = Array.from(new Set(dates));
  if (unique.length === 0) {
    return <div className="ktp-calendar-strip muted">Даты ещё не проставлены — нажмите «Авторасчёт дат».</div>;
  }
  return (
    <div className="ktp-calendar-strip" aria-label="Календарь уроков">
      {unique.map((d) => {
        const count = dates.filter((x) => x === d).length;
        return (
          <span key={d} className={count > 1 ? "ktp-cal-chip is-merged" : "ktp-cal-chip"} title={d}>
            {formatShortDate(d)}
            {count > 1 ? ` ×${count}` : ""}
          </span>
        );
      })}
    </div>
  );
}

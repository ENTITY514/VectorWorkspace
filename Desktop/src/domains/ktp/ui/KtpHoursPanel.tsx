import type { HoursValidationReport } from "../../../ktp/hoursValidation";

export function KtpHoursPanel({ report }: { report: HoursValidationReport }) {
  return (
    <div className={`ktp-hours ktp-hours-${report.overallOk ? "ok" : "warn"}`}>
      <div className="ktp-hours-title">
        Часы: норма {report.norm} ч. ({report.hoursPerWeek} ч/нед) · {report.overallMessage}
      </div>
      {report.quarters.map((q) => (
        <div key={q.quarterNumber} className={q.ok ? "" : "ktp-hours-warn"}>
          {q.quarterNumber}-я четв.: {q.message}.
        </div>
      ))}
    </div>
  );
}

import type { InvariantReport } from "../../../types";

export function KtpInvariantBar({ report }: { report: InvariantReport }) {
  if (report.checks.length === 0) return null;
  return (
    <div className={report.valid ? "invariant invariant-ok" : "invariant invariant-bad"}>
      <div>
        {report.valid
          ? "Оценивание: СОР → буфер → СОЧ и хвост повторений соблюдены"
          : "Оценивание: нарушен порядок СОР/СОЧ или не хватает повторений после СОЧ"}
      </div>
      <div className="invariant-details">
        {report.checks.map((c) => (
          <div key={c.quarterNumber}>
            {c.quarterNumber}-я четв.: {c.fr22Message}; {c.fr23Message}
          </div>
        ))}
      </div>
    </div>
  );
}

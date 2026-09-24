import type { KspValidationReport } from "../../../types";
import { issueTone } from "../kspModel";

export function KspValidationBar({ report }: { report: KspValidationReport | null }) {
  if (!report || report.issues.length === 0) {
    return <div className="ksp-hint">Все проверки пройдены — план можно отмечать готовым к уроку.</div>;
  }
  return (
    <div className="ksp-issues">
      {report.issues.map((i, idx) => (
        <div key={`${i.code}-${idx}`} className={`ksp-issue ksp-issue-${issueTone(i.level)}`}>
          <span className="ksp-issue-code">{i.code}</span>
          {i.message}
        </div>
      ))}
    </div>
  );
}

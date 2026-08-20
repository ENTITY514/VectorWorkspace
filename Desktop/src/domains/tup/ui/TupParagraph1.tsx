import { Section } from "../../../shared/ui/Section";
import type { TupDocumentDetail } from "../../../types";

export function TupParagraph1({ detail, t }: { detail: TupDocumentDetail; t: any }) {
  return (
    <Section title={t.general}>
      {detail.legalBasis && (
        <div className="section-block">
          <h4>{t.legalBasis}</h4>
          <p>{detail.legalBasis}</p>
        </div>
      )}
      {detail.goalText && (
        <div className="section-block">
          <h4>{t.goal}</h4>
          <p>{detail.goalText}</p>
        </div>
      )}
      {detail.tasks.length > 0 && (
        <div className="section-block">
          <h4>{t.tasks}</h4>
          <ol className="tasks-list">
            {detail.tasks.map((task, i) => <li key={i}>{task}</li>)}
          </ol>
        </div>
      )}
      {!detail.legalBasis && !detail.goalText && detail.tasks.length === 0 && (
        <p className="empty">{t.notFilled}</p>
      )}
    </Section>
  );
}
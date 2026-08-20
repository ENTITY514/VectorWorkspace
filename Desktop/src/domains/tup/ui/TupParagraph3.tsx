import { Section } from "../../../shared/ui/Section";
import type { TupDocumentDetail } from "../../../types";

const formatCode = (code: string): string => code.replace(/\s+/g, "");

function QuarterBlock({
  quarter, objectivesByCode, t, lang
}: {
  quarter: TupDocumentDetail["quarters"][number];
  objectivesByCode: Map<string, string>;
  t: any;
  lang: string;
}) {
  return (
    <div className="quarter-block">
      <h4>{quarter.grade} {t.grade} — {quarter.quarterNumber} {t.quarter}</h4>
      {quarter.sections.length === 0 ? (
        <p className="empty">{t.sections}</p>
      ) : (
        quarter.sections.map((section, si) => (
          <div key={si} className="section-block">
            <div className="block-header">
              <h5>{section.name}</h5>
              {section.topics.length > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const { exportToExcel } = await import("../../../lib/tup-excel");
                    const rows = section.topics.map((topic) => {
                      const objectivesText = topic.objectiveCodes
                        .map((c) => {
                          const code = formatCode(c);
                          const desc = objectivesByCode.get(code);
                          return desc ? `${code} — ${desc}` : null;
                        })
                        .filter((x): x is string => x !== null)
                        .join("\n");
                      return [topic.name, objectivesText];
                    });
                    exportToExcel(
                      `${section.name}_${lang === "kz" ? "тақырыптар" : "темы"}`,
                      t.dsp,
                      [
                        { title: t.topic, width: 50 },
                        { title: t.objectiveCodes, width: 90 },
                      ],
                      rows,
                    );
                  }}
                >
                  {t.downloadExcel}
                </button>
              )}
            </div>
            {section.topics.length === 0 ? (
              <p className="empty">{t.topics}</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 240 }}>{t.topic}</th>
                    <th>{t.objectiveCodes}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.topics.map((topic, ti) => (
                    <tr key={ti}>
                      <td>{topic.name}</td>
                      <td>
                        {(() => {
                          const rows = topic.objectiveCodes
                            .map((c) => ({ code: formatCode(c), desc: objectivesByCode.get(formatCode(c)) }))
                            .filter((r) => r.desc);
                          return rows.length === 0 ? (
                            <span className="empty">—</span>
                          ) : (
                            <div className="codes">
                              {rows.map((r, ci) => (
                                <div key={ci} className="code-row">
                                  <span className="code-chip">{r.code}</span>
                                  <span className="code-desc">{r.desc}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function TupParagraph3({
  detail, objectivesByCode, t, lang
}: {
  detail: TupDocumentDetail;
  objectivesByCode: Map<string, string>;
  t: any;
  lang: string;
}) {
  if (detail.quarters.length === 0) return null;
  return (
    <Section title={t.dsp}>
      {detail.quarters.map((quarter) => (
        <QuarterBlock key={`${quarter.grade}-${quarter.quarterNumber}`} quarter={quarter} objectivesByCode={objectivesByCode} t={t} lang={lang} />
      ))}
    </Section>
  );
}
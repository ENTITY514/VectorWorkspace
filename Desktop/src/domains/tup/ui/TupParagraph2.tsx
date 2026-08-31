import { Section } from "../../../shared/ui/Section";

const formatCode = (code: string): string => code.replace(/\s+/g, "");

export function TupParagraph2({
  objectivesByGrade,
  t,
  lang,
  subjectName_
}: {
  objectivesByGrade: any[];
  t: any;
  lang: string;
  subjectName_: string;
}) {
  return (
    <Section title={t.objectives}>
      {objectivesByGrade.length === 0 ? (
        <p className="empty">{t.objectivesEmpty}</p>
      ) : (
        objectivesByGrade.map(({ grade, objectives }) => (
          <div key={grade} className="objective-grade-block">
            <div className="block-header">
              <h4>{grade} {t.grade}</h4>
              {objectives.length > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const { exportToExcel } = await import("../../../lib/tup-excel");
                    const rows = objectives.map((o: any) => [
                      formatCode(o.code),
                      String(o.sectionNumber),
                      String(o.subsectionNumber),
                      o.description,
                    ]);
                    exportToExcel(
                      `${subjectName_}_${grade} ${t.grade}_${lang === "kz" ? "мақсаттар" : "цели"}`,
                      t.objectives,
                      [
                        { title: t.code, width: 10 },
                        { title: t.section, width: 5 },
                        { title: t.subsection, width: 5 },
                        { title: t.objectiveDesc, width: 80 },
                      ],
                      rows,
                    );
                  }}
                >
                  {t.downloadExcel}
                </button>
              )}
            </div>
            {objectives.length === 0 ? (
              <p className="empty">{t.objectiveGradeEmpty}{grade} {t.gradeEmpty}</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>{t.code}</th>
                    <th>{t.section}</th>
                    <th>{t.subsection}</th>
                    <th>{t.objectiveDesc}</th>
                  </tr>
                </thead>
                <tbody>
                  {objectives.map((o: any) => (
                    <tr key={o.id}>
                      <td><code>{formatCode(o.code)}</code></td>
                      <td>{o.sectionNumber}</td>
                      <td>{o.subsectionNumber}</td>
                      <td>{o.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}
    </Section>
  );
}
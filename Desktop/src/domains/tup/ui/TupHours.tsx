import { Section } from "../../../shared/ui/Section";
import type { TupDocumentDetail } from "../../../types";
import { QUARTER_WEEKS } from "../../../ktp/hoursValidation";

const YEAR_WEEKS = QUARTER_WEEKS.reduce((s, n) => s + n, 0);

export function TupHours({
  detail, t, lang, subjectName_
}: {
  detail: TupDocumentDetail;
  t: any;
  lang: string;
  subjectName_: string;
}) {
  if (detail.hours.length === 0) return null;
  return (
    <Section
      title={t.hours}
      action={
        <button
          className="btn btn-sm"
          onClick={async () => {
            const { exportToExcel } = await import("../../../lib/tup-excel");
            const rows = detail.hours.map((h) => [
              `${h.grade} ${t.grade}`,
              String(h.hoursPerWeek),
              String(h.hoursPerYear),
            ]);
            exportToExcel(
              `${subjectName_}_${lang === "kz" ? "жүктеме" : "нагрузка"}`,
              t.hours,
              [
                { title: t.grade, width: 12 },
                { title: t.hoursWeek, width: 18 },
                { title: t.hoursYear, width: 22 },
              ],
              rows,
            );
          }}
        >
          {t.downloadExcel}
        </button>
      }
    >
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 80 }}>{t.grade}</th>
            <th>{t.hoursWeek}</th>
            <th>{t.hoursYear}</th>
          </tr>
        </thead>
        <tbody>
          {[...detail.hours]
            .sort((a, b) => a.grade - b.grade)
            .map((h) => {
              const expected = Math.round(h.hoursPerWeek * YEAR_WEEKS);
              const mismatch = expected > 0 && expected !== Number(h.hoursPerYear);
              return (
                <tr key={h.grade}>
                  <td>{h.grade} {t.grade}</td>
                  <td>{h.hoursPerWeek}</td>
                  <td>
                    {h.hoursPerYear}
                    {mismatch && (
                      <span className="muted">
                        {" "}
                        ({lang === "kz" ? "КТП нормасы" : "норма КТП"} {YEAR_WEEKS}×{h.hoursPerWeek} = {expected})
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </Section>
  );
}
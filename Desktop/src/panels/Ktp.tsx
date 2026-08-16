import { useState } from "react";
import type { AcademicPlan } from "../tup/model/types";
import { Panel } from "../components/ui";
import { generateWordDocument } from "../lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { parseAcademicPlan } from "../tup/api/circulumPlanParser";
import { transformTupToKtp } from "../ktp/lib";

const grades = ["8", "9", "10"];

interface KtpLessonView {
  number: number;
  section: string;
  topic: string;
  hours: number;
  type: "quarter" | "lesson";
}

export function Ktp() {
  const [grade, setGrade] = useState("8");
  const [tupStatus, setTupStatus] = useState<string>("");
  const [tupError, setTupError] = useState<string>("");
  const [lessons, setLessons] = useState<KtpLessonView[]>([]);

  const onTupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTupError("");
    try {
      const plan: AcademicPlan = await parseAcademicPlan(file);
      const ktp = transformTupToKtp(plan);
      setLessons(
        ktp.map((row, i) => ({
          number: i + 1,
          section: row.sectionName,
          topic: row.lessonTopic,
          hours: row.hours,
          type: "lesson",
        })),
      );
      window.__lastTupPlan = plan;
      setTupStatus(`ТУП «${file.name}» загружен: создано ${ktp.length} уроков.`);
    } catch (err) {
      setTupError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = "";
  };

  const exportFromTup = (kundelik: boolean) => {
    const plan = window.__lastTupPlan;
    if (!plan) {
      setTupStatus("Сначала загрузите файл ТУП.");
      return;
    }
    const ktp = transformTupToKtp(plan);
    const fileName = "KTP_из_ТУП";
    if (kundelik) generateKundelikXlsx(ktp, fileName);
    else generateXlsx(ktp, fileName);
    setTupStatus(`Экспортировано из ТУП (${ktp.length} уроков).`);
  };

  const exportWordFromTup = () => {
    const plan = window.__lastTupPlan;
    if (!plan) {
      setTupStatus("Сначала загрузите файл ТУП.");
      return;
    }
    const ktp = transformTupToKtp(plan);
    const totalHours = ktp.reduce((s, r) => s + r.hours, 0);
    generateWordDocument({
      subjectName: grade,
      className: `${grade} класс`,
      hoursPerWeek: 4,
      totalHours,
      plan: ktp,
      quarterWorkHours: { q1: totalHours / 4, q2: totalHours / 4, q3: totalHours / 4, q4: totalHours / 4 },
    });
    setTupStatus(`Word сформирован из ТУП (${ktp.length} уроков).`);
  };

  return (
    <>
      <Panel
        title="Календарно-тематическое планирование"
        subtitle="КТП по математике · Приказ МОН РК № 130"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {grades.map((g) => (
              <button
                key={g}
                className={`btn btn-sm ${grade === g ? "btn-primary" : ""}`}
                onClick={() => setGrade(g)}
              >
                {g} класс
              </button>
            ))}
          </div>
        }
      >
        <div className="panel-body">
          <div className="panel-body" style={{ padding: "10px 0" }}>
            <div className="flash-info" style={{ marginBottom: 12 }}>
              ТУП:{" "}
              <label className="btn btn-sm" style={{ display: "inline-block", cursor: "pointer" }}>
                Загрузить ТУП (.xlsx/.xls)
                <input type="file" accept=".xlsx,.xls" onChange={onTupFile} style={{ display: "none" }} />
              </label>{" "}
              <button className="btn btn-sm" onClick={() => exportFromTup(false)}>Экспорт XLSX из ТУП</button>{" "}
              <button className="btn btn-sm" onClick={() => exportFromTup(true)}>Кунделик из ТУП</button>{" "}
              <button className="btn btn-sm" onClick={exportWordFromTup}>Скачать Word</button>
              {tupStatus && <div style={{ marginTop: 8 }}>{tupStatus}</div>}
              {tupError && <div className="flash-error" style={{ marginTop: 8 }}>{tupError}</div>}
            </div>
          </div>

          {lessons.length === 0 ? (
            <div className="empty">
              Загрузите файл ТУП (.xlsx) для построения календарно-тематического плана. Данные будут сохранены в
              нормативный базис ядра.
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Раздел</th>
                  <th>Тема урока</th>
                  <th>Часы</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l, i) => (
                  <tr key={i}>
                    <td>{l.number}</td>
                    <td className="cell-main">{l.section}</td>
                    <td>{l.topic}</td>
                    <td>{l.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </>
  );
}

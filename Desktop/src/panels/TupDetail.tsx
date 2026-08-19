import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { TupDocumentDetail } from "../types";
import { subjectName } from "./SubjectNames";
import { exportToExcel, exportToExcelMulti, type ExcelColumn } from "../lib/tup-excel";

// Форматирование кода цели (убирает пробелы)
const formatCode = (code: string): string => {
  return code.replace(/\s+/g, "");
};

// Двуязычные заголовки секций: язык документа -> { заголовок, подзаголовки }
const SECTION_TITLES = {
  ru: {
    general: "Параграф 1. Общие положения",
    legalBasis: "Нормативная база",
    goal: "Цель обучения",
    tasks: "Задачи обучения",
    objectives: "Параграф 2. Система целей обучения",
    objectivesEmpty: "Целей для данного документа нет.",
    objectiveGradeEmpty: "Целей для",
    gradeEmpty: "класса нет.",
    dsp: "Параграф 3. Долгосрочный план",
    hours: "Учебная нагрузка",
    hoursWeek: "Часов в неделю",
    hoursYear: "Часов в учебном году",
    code: "Код",
    section: "Раздел",
    subsection: "Подраздел",
    objectiveDesc: "Цель обучения",
    grade: "класс",
    quarter: "четверть",
    sections: "Разделов нет.",
    topics: "Тем нет.",
    topic: "Тема",
    objectiveCodes: "Цели обучения",
    downloadExcel: "Скачать в Excel",
    back: "← Назад к списку",
    grades: "Классы",
    direction: "Направление",
    appendix: "Приложение",
    orderDate: "Дата приказа",
    lang: "Язык обучения",
    totalObjectives: "Всего целей",
    quartersCount: "Четвертей",
    notFilled: "Данные не заполнены.",
  },
  kz: {
    general: "1-параграф. Жалпы ережелер",
    legalBasis: "Нормативтік база",
    goal: "Оқыту мақсаты",
    tasks: "Оқыту міндеттері",
    objectives: "2-параграф. Оқу мақсаттарының жүйесі",
    objectivesEmpty: "Бұл құжат үшін мақсаттар жоқ.",
    objectiveGradeEmpty: "",
    gradeEmpty: "сыныбына мақсаттар жоқ.",
    dsp: "3-параграф. Ұзақ мерзімді жоспар",
    hours: "Оқу жүктемесі",
    hoursWeek: "Аптасына сағат",
    hoursYear: "Оқу жылындағы сағат",
    code: "Код",
    section: "Бөлім",
    subsection: "Бөлімше",
    objectiveDesc: "Оқу мақсаты",
    grade: "сынып",
    quarter: "тоқсан",
    sections: "Бөлімдер жоқ.",
    topics: "Тақырыптар жоқ.",
    topic: "Тақырып",
    objectiveCodes: "Оқу мақсаттары",
    downloadExcel: "Excel-ге жүктеу",
    back: "← Тізімге қайту",
    grades: "Сыныптар",
    direction: "Бағыты",
    appendix: "Қосымша",
    orderDate: "Бұйрық күні",
    lang: "Оқыту тілі",
    totalObjectives: "Барлығы мақсаттар",
    quartersCount: "Тоқсандар",
    notFilled: "Деректер толтырылмаған.",
  },
} as const;

type Lang = "ru" | "kz";

export function TupDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<TupDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.fetchTupDocument(id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const lang: Lang = detail?.language === "kz" ? "kz" : "ru";
  const t = SECTION_TITLES[lang];
  const subjectName_ = detail ? subjectName(detail.subjectId, detail.language) : "";

  // Классы для группировки целей
  const grades = useMemo(() => {
    if (!detail?.targetGrades) return [];
    if (detail.targetGrades.includes("-")) {
      const [lo, hi] = detail.targetGrades.split("-").map((s: string) => Number(s.trim()));
      if (!isNaN(lo) && !isNaN(hi)) {
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      }
    }
    const single = Number(detail.targetGrades.trim());
    return !isNaN(single) ? [single] : [];
  }, [detail?.targetGrades]);

  // Цели по классам (для параграфа 2)
  const objectivesByGrade = useMemo(() => {
    if (!detail) return [];
    const map = new Map<number, typeof detail.objectives>();
    for (const o of detail.objectives) {
      if (!map.has(o.grade)) map.set(o.grade, []);
      map.get(o.grade)!.push(o);
    }
    return grades.map(g => ({ grade: g, objectives: map.get(g) ?? [] }));
  }, [detail?.objectives, grades]);

  // Словарь «код цели -> её описание» для подстановки текста в ДСП (Параграф 3).
  const objectivesByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of detail?.objectives ?? []) {
      if (!map.has(formatCode(o.code))) {
        map.set(formatCode(o.code), o.description);
      }
    }
    return map;
  }, [detail?.objectives]);

  // Экспорт всего документа в один .xlsx с несколькими вкладками.
  const exportWholeDocument = useMemo(() => {
    if (!detail) return undefined;
    const sheets: { sheetName: string; headers: ExcelColumn[]; rows: (string | number)[][] }[] = [];

    // Вкладка 1: Общие положения
    const generalRows: (string | number)[][] = [];
    if (detail.legalBasis) generalRows.push([t.legalBasis, detail.legalBasis]);
    if (detail.goalText) generalRows.push([t.goal, detail.goalText]);
    for (const task of detail.tasks) generalRows.push([t.tasks, task]);
    sheets.push({
      sheetName: t.general,
      headers: [
        { title: t.code, width: 30 },
        { title: t.objectiveDesc, width: 90 },
      ],
      rows: generalRows,
    });

    // Вкладка 2: Матрица целей (П2)
    const objectiveRows = detail.objectives.map((o) => [
      formatCode(o.code),
      String(o.sectionNumber),
      String(o.subsectionNumber),
      o.description,
    ]);
    sheets.push({
      sheetName: t.objectives,
      headers: [
        { title: t.code, width: 12 },
        { title: t.section, width: 10 },
        { title: t.subsection, width: 12 },
        { title: t.objectiveDesc, width: 80 },
      ],
      rows: objectiveRows,
    });

    // Вкладка 3: Долгосрочный план (П3)
    const dspRows: (string | number)[][] = [];
    for (const q of detail.quarters) {
      for (const s of q.sections) {
        for (const topic of s.topics) {
          const objectivesText = topic.objectiveCodes
            .map((c) => {
              const desc = objectivesByCode.get(formatCode(c));
              return desc ? `${formatCode(c)} — ${desc}` : null;
            })
            .filter((x): x is string => x !== null)
            .join("\n");
          dspRows.push([`${q.grade} ${t.grade}, ${q.quarterNumber} ${t.quarter}`, s.name, topic.name, objectivesText]);
        }
      }
    }
    sheets.push({
      sheetName: t.dsp,
      headers: [
        { title: `${t.grade} / ${t.quarter}`, width: 20 },
        { title: t.section, width: 40 },
        { title: t.topic, width: 50 },
        { title: t.objectiveCodes, width: 90 },
      ],
      rows: dspRows,
    });

    // Вкладка 4: Учебная нагрузка
    const hoursRows = detail.hours.map((h) => [
      `${h.grade} ${t.grade}`,
      String(h.hoursPerWeek),
      String(h.hoursPerYear),
    ]);
    sheets.push({
      sheetName: t.hours,
      headers: [
        { title: t.grade, width: 12 },
        { title: t.hoursWeek, width: 18 },
        { title: t.hoursYear, width: 22 },
      ],
      rows: hoursRows,
    });

    return () => exportToExcelMulti(`${subjectName_}_${lang === "kz" ? "толық" : "полный"}`, sheets);
  }, [detail, objectivesByCode, t, lang, subjectName_]);

  if (loading) return <div className="empty">Загрузка документа...</div>;
  if (error) return <div className="flash-error">{error}</div>;
  if (!detail) return null;

  return (
    <div className="tup-detail">
      {/* Кнопка назад */}
      <button className="btn btn-sm" onClick={onClose} style={{ marginBottom: 16 }}>
        ← Назад к списку
      </button>

      {/* Заголовок документа */}
      <div className="doc-header">
        <div className="block-header">
          <h2>{subjectName_}</h2>
          {exportWholeDocument && (
            <button className="btn btn-sm" onClick={() => exportWholeDocument()}>
              {lang === "kz" ? "Excel-ге толық экспорт" : "Экспортировать весь документ в Excel"}
            </button>
          )}
        </div>
        <div className="doc-meta-row">
          <span><b>{t.grades}:</b> {detail.targetGrades}</span>
          <span><b>{t.direction}:</b> {detail.direction === "emn" ? "ЕМН" : detail.direction === "ogn" ? "ОГН" : lang === "kz" ? "Жалпы" : "Общее"}</span>
          <span><b>{t.appendix}:</b> {detail.appendixNumber}</span>
        </div>
        <div className="doc-meta-row">
          <span><b>{t.orderDate}:</b> {detail.orderDate}</span>
          <span><b>{t.lang}:</b> {detail.language}</span>
        </div>
      </div>

      {/* Параграф 1 — Общие положения */}
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
              {detail.tasks.map((task, i) => (
                <li key={i}>{task}</li>
              ))}
            </ol>
          </div>
        )}

        {!detail.legalBasis && !detail.goalText && detail.tasks.length === 0 && (
          <p className="empty">{t.notFilled}</p>
        )}
      </Section>

      {/* Параграф 2 — Цели обучения */}
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
                    onClick={() => {
                      const rows = objectives.map((o) => [
                        formatCode(o.code),
                        String(o.sectionNumber),
                        String(o.subsectionNumber),
                        o.description,
                      ]);
                      exportToExcel(
                        `${subjectName_}_${grade} ${t.grade}_${lang === "kz" ? "мақсаттар" : "цели"}`,
                        t.objectives,
                        [
                          { title: t.code, width: 12 },
                          { title: t.section, width: 10 },
                          { title: t.subsection, width: 12 },
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
                    {objectives.map((o) => (
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

      {/* Параграф 3 — Долгосрочный план */}
      {detail.quarters.length > 0 && (
        <Section title={t.dsp}>
          {detail.quarters.map((quarter) => (
            <QuarterBlock key={`${quarter.grade}-${quarter.quarterNumber}`} quarter={quarter} objectivesByCode={objectivesByCode} lang={lang} />
          ))}
        </Section>
      )}

      {/* Учебная нагрузка */}
      {detail.hours.length > 0 && (
        <Section
          title={t.hours}
          action={
            <button
              className="btn btn-sm"
              onClick={() => {
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
              {detail.hours.map((h) => (
                <tr key={h.grade}>
                  <td>{h.grade} {t.grade}</td>
                  <td>{h.hoursPerWeek}</td>
                  <td>{h.hoursPerYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Статистика */}
      <div className="stats-row" style={{ marginTop: 24, display: "flex", gap: 16 }}>
        <Stat label={t.totalObjectives} value={String(detail.objectives.length)} />
        {detail.quarters.length > 0 && (
          <Stat label={t.quartersCount} value={String(detail.quarters.reduce((s, q) => s + q.sections.length, 0))} />
        )}
      </div>
    </div>
  );
}

function QuarterBlock({ quarter, objectivesByCode, lang }: { quarter: TupDocumentDetail["quarters"][number]; objectivesByCode: Map<string, string>; lang: Lang }) {
  const t = SECTION_TITLES[lang];
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
                  onClick={() => {
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="block-header">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

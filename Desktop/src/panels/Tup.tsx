import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import type { LearningObjective, TupDocument } from "../types";
import { Badge, Panel, Stat } from "../components/ui";

const SUBJECT_NAMES: Record<string, string> = {
  alphabet: "Әліппе",
  bukvar: "Букварь",
  gramota: "Обучение грамоте",
  elipbe: "Елипбә",
  alifbe: "Алифбе",
  alifbo: "Алифбо",
  ana_tili: "Ана тілі",
  mathematics: "Математика",
  digital_literacy: "Цифровая грамотность",
  natural_science: "Естествознание",
  world_knowledge: "Познание мира",
  visual_art: "Изобразительное искусство",
  labor_training: "Трудовое обучение",
  art_work: "Художественный труд",
  music: "Музыка",
  physical_education: "Физическая культура",
  literary_reading: "Литературное чтение",
  kazakh_language: "Казахский язык",
  kazakh_tili: "Қазақ тілі",
  russian_language: "Русский язык",
  uigur_language: "Уйгурский язык",
  uzbek_language: "Узбекский язык",
  tadzhik_language: "Таджикский язык",
  english: "Английский язык",
  german: "Немецкий язык",
  french: "Французский язык",
  kazakh_literature: "Казахская литература",
  kazakh_adebieti: "Қазақ әдебиеті",
  russian_literature: "Русская литература",
  uigur_literature: "Уйгурская литература",
  uzbek_literature: "Узбекская литература",
  tadzhik_literature: "Таджикская литература",
  kazakh_language_literature: "Казахский язык и литература",
  russian_language_literature: "Русский язык и литература",
  algebra: "Алгебра",
  geometry: "Геометрия",
  algebra_analysis: "Алгебра и начала анализа",
  informatics: "Информатика",
  physics: "Физика",
  chemistry: "Химия",
  biology: "Биология",
  geography: "География",
  kazakhstan_history: "История Казахстана",
  world_history: "Всемирная история",
  law_fundamentals: "Основы права",
  abaitanu: "Абайтану",
  regional_studies: "Краеведение",
  graphics_design: "Графика и проектирование",
  military_training: "НВТП",
  entrepreneurship: "Основы предпринимательства и бизнеса",
};

function subjectName(slug: string): string {
  return SUBJECT_NAMES[slug] ?? slug;
}

function gradesOf(targetGrades: string): number[] {
  const [lo, hi] = targetGrades.split("-").map((s) => Number(s.trim()));
  const out: number[] = [];
  for (let g = lo; g <= hi; g++) out.push(g);
  return out;
}

export function Tup() {
  const [documents, setDocuments] = useState<TupDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await api.listTupDocuments();
      setDocuments(docs);
      if (!selectedId && docs.length > 0) setSelectedId(docs[0].id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId],
  );

  const grades = useMemo(() => (selected ? gradesOf(selected.targetGrades) : []), [selected]);

  useEffect(() => {
    if (!selectedId) return;
    setObjectives([]);
    if (grade == null) return;
    api
      .listObjectives(selectedId, grade)
      .then(setObjectives)
      .catch((e) => setError(String(e)));
  }, [selectedId, grade]);

  const onImport = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: "ТУП JSON", extensions: ["json"] }],
    });
    if (typeof file !== "string") return;
    setStatus("Импорт…");
    setError(null);
    try {
      const results = await api.importTupJson(file);
      setStatus(
        `Импортировано документов: ${results.length} (${results.reduce((s, r) => s + r.objectivesImported, 0)} целей).`,
      );
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(String(e));
      setStatus(null);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, TupDocument[]>();
    for (const d of documents) {
      const list = map.get(d.subjectId) ?? [];
      list.push(d);
      map.set(d.subjectId, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [documents]);

  const totalObjectives = documents.reduce((s, d) => s + d.objectiveCount, 0);

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Документов ТУП" value={String(documents.length)} />
        <Stat label="Целей обучения" value={String(totalObjectives)} />
        <Stat label="Языков" value={String(new Set(documents.map((d) => d.language)).size)} />
        <Stat label="Статус базы" value={loading ? "загрузка" : "готово"} tone={error ? "red" : "green"} />
      </div>

      <Panel
        title="Нормативный базис — ТУП"
        subtitle="Типовые учебные программы: документы и цели обучения"
        actions={
          <button className="btn btn-sm" onClick={onImport}>
            Импорт JSON (HTML)
          </button>
        }
      >
        <div className="panel-body">
          {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}
          {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}

          {documents.length === 0 ? (
            <div className="empty">
              База пуста. Импортируйте ТУП: кнопка «Импорт JSON (HTML)» — файл
              <code> tup_all_subjects_html.json</code> из <code>Desktop\src-tauri\exports</code>.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ width: "42%", flexShrink: 0 }}>
                <div className="section-label">Документы</div>
                <div className="list-card" style={{ maxHeight: 520, overflowY: "auto" }}>
                  {groups.map(([subject, docs]) => (
                    <div key={subject}>
                      <div className="cell-main" style={{ margin: "10px 2px 4px" }}>
                        {subjectName(subject)}
                      </div>
                      {docs.map((d) => (
                        <button
                          key={d.id}
                          className={`item ${selectedId === d.id ? "item-active" : ""}`}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                            background: selectedId === d.id ? "var(--accent-soft)" : undefined,
                            borderColor: selectedId === d.id ? "var(--accent)" : undefined,
                          }}
                          onClick={() => {
                            setSelectedId(d.id);
                            setGrade(null);
                          }}
                        >
                          <div>
                            <b>{d.targetGrades}</b>
                            {d.direction !== "common" && (
                              <span className="muted"> · {d.direction === "emn" ? "ЕМН" : "ОГН"}</span>
                            )}
                            <div className="cell-sub">
                              прил. {d.appendixNumber} · {d.language} · {d.objectiveCount} целей
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div className="section-label">Цели обучения</div>
                {!selected ? (
                  <div className="empty">Выберите документ слева.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
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

                    {grade == null ? (
                      <div className="empty">Выберите класс для просмотра целей.</div>
                    ) : objectives.length === 0 ? (
                      <div className="empty">Целей для {grade} класса нет.</div>
                    ) : (
                      <table className="data">
                        <thead>
                          <tr>
                            <th style={{ width: 90 }}>Код</th>
                            <th>Цель обучения</th>
                          </tr>
                        </thead>
                        <tbody>
                          {objectives.map((o) => (
                            <tr key={o.id}>
                              <td>
                                <Badge color="blue">{o.code}</Badge>
                              </td>
                              <td>{o.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

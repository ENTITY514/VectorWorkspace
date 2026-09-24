import type { KspEditorHook } from "../useKspEditor";
import { formatKspDate } from "../kspModel";

export function KspHeaderPanel({ hook, onOpenKtp }: { hook: KspEditorHook; onOpenKtp?: (planId: string) => void }) {
  const { doc, values, patchContent } = hook;
  if (!doc) return null;
  const h = doc.content.header;

  return (
    <div className="ksp-header">
      <div className="ksp-header-top">
        <div>
          <div className="ksp-kicker">из КТП · не редактируется здесь</div>
          <h2 className="ksp-title">{h.topic || "Тема урока"}</h2>
          <div className="muted">{h.section || "Раздел"} · {formatKspDate(h.plannedDate)} · класс «{doc.className || h.className}»</div>
        </div>
        {onOpenKtp && (
          <button className="btn btn-sm" onClick={() => onOpenKtp(doc.ktpPlanId)}>Открыть урок в КТП</button>
        )}
      </div>

      <div className="ksp-obj-row">
        {h.learningObjectives.length === 0 ? (
          <span className="muted">Цели обучения не привязаны в КТП.</span>
        ) : h.learningObjectives.map((o) => (
          <span key={o.code} className="chip" title={o.text}>{o.code}</span>
        ))}
      </div>
      {h.learningObjectives.map((o) => (
        <div key={`${o.code}-t`} className="ksp-obj-text">{o.code}: {o.text}</div>
      ))}

      <div className="ksp-grid2">
        <label className="ksp-field">
          <span>ФИО педагога</span>
          <input
            value={h.teacherName}
            onChange={(e) => patchContent((d) => ({
              ...d,
              content: { ...d.content, header: { ...d.content.header, teacherName: e.target.value } },
            }))}
          />
        </label>
        <label className="ksp-field">
          <span>Класс</span>
          <input
            value={doc.className}
            onChange={(e) => patchContent((d) => ({
              ...d,
              className: e.target.value,
              content: { ...d.content, header: { ...d.content.header, className: e.target.value } },
            }))}
          />
        </label>
      </div>

      <label className="ksp-field">
        <span>Цель урока (все ученики)</span>
        <textarea
          rows={2}
          value={h.lessonGoals.all}
          onChange={(e) => patchContent((d) => ({
            ...d,
            content: { ...d.content, header: { ...d.content.header, lessonGoals: { ...d.content.header.lessonGoals, all: e.target.value } } },
          }))}
        />
      </label>
      <div className="ksp-grid2">
        <label className="ksp-field">
          <span>Большинство</span>
          <textarea
            rows={2}
            value={h.lessonGoals.most}
            onChange={(e) => patchContent((d) => ({
              ...d,
              content: { ...d.content, header: { ...d.content.header, lessonGoals: { ...d.content.header.lessonGoals, most: e.target.value } } },
            }))}
          />
        </label>
        <label className="ksp-field">
          <span>Некоторые</span>
          <textarea
            rows={2}
            value={h.lessonGoals.some}
            onChange={(e) => patchContent((d) => ({
              ...d,
              content: { ...d.content, header: { ...d.content.header, lessonGoals: { ...d.content.header.lessonGoals, some: e.target.value } } },
            }))}
          />
        </label>
      </div>

      <div className="ksp-values">
        {values.map((v) => {
          const on = h.valuesComponent.valueIds.includes(v.code);
          return (
            <label key={v.code} className={`ktp-day ${on ? "" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => patchContent((d) => {
                  const ids = d.content.header.valuesComponent.valueIds;
                  const next = ids.includes(v.code) ? ids.filter((x) => x !== v.code) : [...ids, v.code];
                  return {
                    ...d,
                    content: { ...d.content, header: { ...d.content.header, valuesComponent: { ...d.content.header.valuesComponent, valueIds: next } } },
                  };
                })}
              />
              {v.titleRu}
            </label>
          );
        })}
      </div>
      <label className="ksp-field">
        <span>Воспитательная задача</span>
        <textarea
          rows={3}
          value={h.valuesComponent.text}
          onChange={(e) => patchContent((d) => ({
            ...d,
            content: { ...d.content, header: { ...d.content.header, valuesComponent: { ...d.content.header.valuesComponent, text: e.target.value } } },
          }))}
        />
      </label>
    </div>
  );
}

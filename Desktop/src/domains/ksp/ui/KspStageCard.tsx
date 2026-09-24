import type { KspStage } from "../../../types";
import type { KspEditorHook } from "../useKspEditor";
import { STAGE_LABEL, STAGE_TYPES } from "../kspModel";

export function KspStageCard({
  stage,
  index,
  hook,
}: {
  stage: KspStage;
  index: number;
  hook: KspEditorHook;
}) {
  const { openStageId, setOpenStageId, updateStage, removeStage, moveStage, doc } = hook;
  const open = openStageId === stage.id;
  const issues = hook.report?.issues.filter((i) => i.stageId === stage.id) ?? [];

  return (
    <div className={`ksp-stage ${open ? "open" : ""}`}>
      <div className="ksp-stage-head" onClick={() => setOpenStageId(open ? null : stage.id)}>
        <span className="ksp-stage-idx">{index + 1}</span>
        <strong>{STAGE_LABEL[stage.type]}</strong>
        <span className="muted">{stage.durationMinutes} мин</span>
        {issues.length > 0 && <span className="badge badge-red">{issues.length}</span>}
        <span className="ksp-stage-tools" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" disabled={index === 0} onClick={() => moveStage(index, index - 1)}>↑</button>
          <button className="btn btn-sm" disabled={!doc || index >= doc.content.stages.length - 1} onClick={() => moveStage(index, index + 1)}>↓</button>
          <button className="btn btn-sm btn-danger" onClick={() => {
            if (window.confirm(`Удалить этап «${STAGE_LABEL[stage.type]}»?`)) removeStage(stage.id);
          }}>×</button>
        </span>
      </div>
      {open && (
        <div className="ksp-stage-body">
          <div className="ksp-grid2">
            <label className="ksp-field">
              <span>Тип этапа</span>
              <select value={stage.type} onChange={(e) => updateStage(stage.id, { type: e.target.value as KspStage["type"] })}>
                {STAGE_TYPES.map((t) => <option key={t} value={t}>{STAGE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="ksp-field">
              <span>Минуты</span>
              <input
                type="number"
                min={1}
                value={stage.durationMinutes}
                onChange={(e) => updateStage(stage.id, { durationMinutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          </div>
          <div className="ksp-grid2">
            <label className="ksp-field">
              <span>Действия педагога</span>
              <textarea rows={8} value={stage.teacherActions} onChange={(e) => updateStage(stage.id, { teacherActions: e.target.value })} />
            </label>
            <label className="ksp-field">
              <span>Действия учеников</span>
              <textarea rows={8} value={stage.studentActions} onChange={(e) => updateStage(stage.id, { studentActions: e.target.value })} />
            </label>
          </div>
          <label className="ksp-field">
            <span>Ресурсы (учебник, карточки, приложение)</span>
            <input
              value={stage.resources.map((r) => r.display).join(", ")}
              onChange={(e) => updateStage(stage.id, {
                resources: e.target.value.trim()
                  ? e.target.value.split(",").map((x) => ({ kind: "note", display: x.trim() })).filter((r) => r.display)
                  : [],
              })}
            />
          </label>
          <div className="ksp-grid2">
            <label className="ksp-field">
              <span>Оценивание</span>
              <select
                value={stage.assessment.mode}
                onChange={(e) => updateStage(stage.id, {
                  assessment: { ...stage.assessment, mode: e.target.value as KspStage["assessment"]["mode"] },
                })}
              >
                <option value="none">Нет</option>
                <option value="formative">Формативное (без баллов)</option>
                <option value="summative">Суммативное (с баллами)</option>
              </select>
            </label>
            {stage.assessment.mode === "summative" && (
              <label className="ksp-field">
                <span>Максимум баллов</span>
                <input
                  type="number"
                  min={1}
                  value={stage.assessment.maxPoints ?? 10}
                  onChange={(e) => updateStage(stage.id, {
                    assessment: { ...stage.assessment, maxPoints: Number(e.target.value) || 10 },
                  })}
                />
              </label>
            )}
          </div>
          {stage.assessment.mode !== "none" && (
            <label className="ksp-field">
              <span>Дескрипторы (каждый с новой строки{stage.assessment.mode === "summative" ? ", баллы: «текст | 2»" : ""})</span>
              <textarea
                rows={4}
                value={stage.assessment.descriptors.map((d) =>
                  d.points != null ? `${d.text} | ${d.points}` : d.text,
                ).join("\n")}
                onChange={(e) => {
                  const descriptors = e.target.value.split("\n").map((line) => {
                    const [text, pts] = line.split("|").map((x) => x.trim());
                    const points = stage.assessment.mode === "summative" && pts ? Number(pts) : null;
                    return { text, points: Number.isFinite(points as number) ? points : null };
                  }).filter((d) => d.text);
                  updateStage(stage.id, { assessment: { ...stage.assessment, descriptors } });
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

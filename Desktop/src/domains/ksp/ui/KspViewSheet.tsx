import type { KspDocument } from "../../../types";
import { STAGE_LABEL, formatKspDate, stageAssessText } from "../kspModel";

export function KspViewSheet({ doc }: { doc: KspDocument }) {
  const h = doc.content.header;
  const goals = h.learningObjectives.map((o) => `${o.code} ${o.text}`).join("\n");
  const lessonGoal = [h.lessonGoals.all, h.lessonGoals.most, h.lessonGoals.some].filter(Boolean).join("\n");
  const hw = [doc.content.homework.text, doc.content.homework.checkMethod && `Проверка: ${doc.content.homework.checkMethod}`]
    .filter(Boolean)
    .join("\n");

  const meta: [string, string][] = [
    ["Раздел", h.section || "—"],
    ["ФИО педагога", h.teacherName || "—"],
    ["Дата", formatKspDate(h.plannedDate)],
    ["Класс", `«${doc.className || h.className || "—"}»`],
    ["Тема урока", h.topic || "—"],
    ["Цели обучения в соответствии с учебной программой", goals || "—"],
    ["Цель урока", lessonGoal || "—"],
    ["Воспитательная задача", h.valuesComponent.text || "—"],
  ];

  return (
    <table className="ksp-view-table">
      <tbody>
        {meta.map(([label, value]) => (
          <tr key={label}>
            <th className="ksp-view-meta">{label}</th>
            <td colSpan={4} className="ksp-view-pre">{value}</td>
          </tr>
        ))}
        <tr>
          <th>Этап урока / время</th>
          <th>Действия педагога</th>
          <th>Действия учеников</th>
          <th>Оценивание</th>
          <th>Ресурсы</th>
        </tr>
        {doc.content.stages.map((s) => (
          <tr key={s.id}>
            <th className="ksp-view-stage">{STAGE_LABEL[s.type]} ({s.durationMinutes} мин)</th>
            <td className="ksp-view-pre">{s.teacherActions || "—"}</td>
            <td className="ksp-view-pre">{s.studentActions || "—"}</td>
            <td className="ksp-view-pre">{stageAssessText(s) || "—"}</td>
            <td>{s.resources.map((r) => r.display).join(", ") || "—"}</td>
          </tr>
        ))}
        <tr>
          <th className="ksp-view-meta">Домашнее задание</th>
          <td colSpan={4} className="ksp-view-pre">{hw || "—"}</td>
        </tr>
      </tbody>
    </table>
  );
}

import { useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { scheduleApi } from "../api";
import type { ReportFormat, ReportScope, ScheduleState } from "../../../types";

type ScopeKind = ReportScope["kind"];

const SCOPE_LABELS: Record<ScopeKind, string> = {
  all: "Всё расписание",
  all_classes: "По классам — все",
  class: "По классам — один",
  all_teachers: "По учителям — все",
  teacher: "По учителям — один",
};

const SCOPE_HINTS: Record<ScopeKind, string> = {
  all: "Общая сетка: классы по столбцам, дни и уроки по строкам.",
  all_classes: "Сводная сетка и отдельный лист на каждый класс.",
  class: "Один класс: дни по столбцам, уроки по строкам.",
  all_teachers: "Сводная сетка и отдельный лист на каждого учителя.",
  teacher: "Один учитель: его уроки и итог нагрузки за неделю.",
};

/**
 * Выгрузка расписания в Excel или PDF.
 *
 * Формируется в ядре и сразу пишется в выбранный пользователем файл:
 * книга на тридцать листов — это мегабайты, передавать их во фронтенд
 * ради последующей записи на диск незачем.
 */
export function ExportModal({
  state, variantId, onClose,
}: {
  state: ScheduleState;
  variantId: string | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ScopeKind>("all");
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [format, setFormat] = useState<ReportFormat>("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  // Показываем только тех, у кого есть уроки: выгружать пустой лист незачем.
  const classesWithLessons = useMemo(() => {
    const ids = new Set(state.slots.map((s) => s.class_id));
    return state.classes.filter((c) => ids.has(c.id));
  }, [state.classes, state.slots]);

  const teachersWithLessons = useMemo(() => {
    const ids = new Set(state.slots.map((s) => s.teacher_id));
    return state.teachers.filter((t) => ids.has(t.id));
  }, [state.teachers, state.slots]);

  const scope: ReportScope | null = useMemo(() => {
    switch (kind) {
      case "class":
        return classId ? { kind: "class", id: classId } : null;
      case "teacher":
        return teacherId ? { kind: "teacher", id: teacherId } : null;
      default:
        return { kind } as ReportScope;
    }
  }, [kind, classId, teacherId]);

  const run = async () => {
    if (!scope) return;
    setBusy(true);
    setError(null);
    setSavedPath(null);
    try {
      const stem = await scheduleApi.reportFilename(scope, variantId ?? undefined);
      const path = await save({
        defaultPath: `${stem}.${format}`,
        filters: [
          format === "xlsx"
            ? { name: "Книга Excel", extensions: ["xlsx"] }
            : { name: "PDF", extensions: ["pdf"] },
        ],
      });
      if (!path) return;
      setSavedPath(await scheduleApi.exportReport(scope, format, path, variantId ?? undefined));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const noLessons = state.slots.length === 0;
  const needsPick =
    (kind === "class" && !classId) || (kind === "teacher" && !teacherId);

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>Выгрузка расписания</h2>
          <button className="clear-search-btn" onClick={onClose} disabled={busy}>✕</button>
        </div>

        {noLessons ? (
          <div className="card warn-soft">
            В активном варианте нет ни одного урока. Сгенерируйте расписание
            или выберите другой вариант.
          </div>
        ) : (
          <>
            <div className="stack-sm">
              <span className="form-label">Что выгружаем</span>
              {(Object.keys(SCOPE_LABELS) as ScopeKind[]).map((k) => (
                <label key={k} className="row gap-sm" style={{ alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    name="export-scope"
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    {SCOPE_LABELS[k]}
                    <br />
                    <span className="muted">{SCOPE_HINTS[k]}</span>
                  </span>
                </label>
              ))}
            </div>

            {kind === "class" && (
              <div className="form-grid">
                <label className="form-label" htmlFor="exp-class">Класс</label>
                <select
                  id="exp-class"
                  className="input"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  <option value="">— выберите класс —</option>
                  {classesWithLessons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grade}{c.letter}
                      {c.class_type === "luo" ? " ЛУО" : c.class_type === "do" ? " ДО" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {kind === "teacher" && (
              <div className="form-grid">
                <label className="form-label" htmlFor="exp-teacher">Учитель</label>
                <select
                  id="exp-teacher"
                  className="input"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                >
                  <option value="">— выберите учителя —</option>
                  {teachersWithLessons.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-grid">
              <span className="form-label">Формат</span>
              <div className="row gap-sm">
                <label className="row gap-sm">
                  <input
                    type="radio"
                    name="export-format"
                    checked={format === "xlsx"}
                    onChange={() => setFormat("xlsx")}
                  />
                  Excel
                </label>
                <label className="row gap-sm">
                  <input
                    type="radio"
                    name="export-format"
                    checked={format === "pdf"}
                    onChange={() => setFormat("pdf")}
                  />
                  PDF
                </label>
              </div>
            </div>

            <p className="muted">
              {format === "xlsx"
                ? "Excel: каждый срез отдельным листом, ширины колонок и переносы уже настроены."
                : "PDF: альбомная A4, по странице на класс или учителя. Готов к печати."}
            </p>

            {error && <div className="error">{error}</div>}
            {savedPath && (
              <div className="card success">
                Сохранено: <span className="ellipsis" title={savedPath}>{savedPath}</span>
              </div>
            )}

            <div className="row gap-sm" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={run} disabled={busy || needsPick}>
                {busy ? "Формирую..." : "Сохранить файл"}
              </button>
              <button className="btn" onClick={onClose} disabled={busy}>Закрыть</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

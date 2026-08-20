import { DndContext, closestCenter } from "@dnd-kit/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Panel } from "../components/ui";
import { SUBJECT_NAMES } from "./SubjectNames";
import { KtpTable } from "../ktp/KtpTable";
import { useKtpEditorState } from "../ktp/useKtpEditorState";
import { adiletAppendixUrl } from "../lib/adilet";
import { sourceDocLabel } from "../lib/sourceDoc";
import { validateHours } from "../ktp/hoursValidation";
import { IKtpLesson } from "../ktp/model/types";

const WEEKDAYS = [
  { num: 1, label: "Пн" },
  { num: 2, label: "Вт" },
  { num: 3, label: "Ср" },
  { num: 4, label: "Чт" },
  { num: 5, label: "Пт" },
  { num: 6, label: "Сб" },
];


interface Props {
  planId: string;
  onClose: () => void;
}

export function KtpEditor({ planId, onClose }: Props) {
  const {
    dbPlan, history, flat, loading, error, status, toast, busy, daysOfWeek, sourceDoc,
    historyOpen, templateFor, templateName, unfilledQuarter, editing, draft, mergeFor, mergeReason,
    setDaysOfWeek, setHistoryOpen, setTemplateFor, setTemplateName, setUnfilledQuarter, setDraft, setMergeFor, setMergeReason,
    save, recalcSchedule, applyEdit, beginEdit, doAddHour, doDeleteLesson, doSplit, doAddSor, doMergeObjectivesNext,
    handleDragEnd, updateLesson, confirmMerge, doSaveTemplate, exportWord, exportXlsx,
    hoursReport, progress
  } = useKtpEditorState(planId);

  const planName = dbPlan
    ? `${SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId} · ${dbPlan.grade} класс · ${dbPlan.language} · ${dbPlan.academicYear}`
    : "";

  return (
    <Panel
      title="Редактор КТП"
      actions={
        <button className="btn btn-sm" onClick={onClose}>
          ← К списку
        </button>
      }
    >
      <div className="panel-body">
        {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}
        {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}
        {toast && <div className="toast">{toast}</div>}
        {loading && <div className="empty">Загрузка плана…</div>}

        {!loading && !dbPlan && !error && <div className="empty">План не найден.</div>}

        {dbPlan && (
          <>
            <div className="ktp-schedule">
              <span className="ktp-schedule-label">{planName}</span>
              {sourceDoc ? (
                <a
                  className="ktp-source-link"
                  title="Открыть оригинал документа ТУП"
                  onClick={() => openUrl(adiletAppendixUrl(sourceDoc.language, sourceDoc.appendixNumber))}
                >
                  {sourceDocLabel(sourceDoc)} · [ссылка]
                </a>
              ) : (
                <span className="ktp-source-missing">Источник не определён — создайте КТП из документа ТУП.</span>
              )}
              <span style={{ marginLeft: "auto" }}>Дни недели:</span>
              {WEEKDAYS.map((w) => (
                <label key={w.num} className="ktp-day">
                  <input
                    type="checkbox"
                    checked={daysOfWeek.includes(w.num)}
                    onChange={() =>
                      setDaysOfWeek((prev) =>
                        prev.includes(w.num) ? prev.filter((n) => n !== w.num) : [...prev, w.num].sort(),
                      )
                    }
                  />
                  {w.label}
                </label>
              ))}
              <button className="btn btn-sm" onClick={recalcSchedule} disabled={busy || daysOfWeek.length === 0}>
                Авторасчёт дат
              </button>
              <button
                className="btn btn-sm"
                disabled={!history.canUndo}
                onClick={() => history.undo()}
                title="Отменить (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                className="btn btn-sm"
                disabled={!history.canRedo}
                onClick={() => history.redo()}
                title="Повторить (Ctrl+Y)"
              >
                ↷
              </button>
              <button className="btn btn-sm" onClick={() => setHistoryOpen((v) => !v)} title="История изменений">
                История
              </button>
              <button className="btn btn-sm" onClick={() => setTemplateFor(true)} title="Сохранить план как шаблон">
                В шаблон
              </button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                {busy ? "…" : "Сохранить"}
              </button>
            </div>

            {historyOpen && (
              <div className="ktp-history">
                <div className="ktp-history-title">История изменений</div>
                {history.labels.length === 0 ? (
                  <div className="muted">Пока нет действий.</div>
                ) : (
                  history.labels
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <div key={history.labels.length - i} className="ktp-history-item">
                        <span>{h.label}</span>
                        <span className="muted">{new Date(h.ts).toLocaleTimeString()}</span>
                      </div>
                    ))
                )}
              </div>
            )}

            <HoursPanel report={hoursReport} />
            <ProgressPanel progress={progress} onShowQuarter={setUnfilledQuarter} />

            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <KtpTable
                flat={flat}
                editing={editing}
                draft={draft}
                setDraft={setDraft}
                beginEdit={beginEdit}
                applyEdit={applyEdit}
                onUpdate={updateLesson}
                onAddHour={doAddHour}
                onDelete={doDeleteLesson}
                onSplit={doSplit}
                onAddSor={doAddSor}
                onMerge={(id) => { setMergeFor(id); setMergeReason(""); }}
                onMergeObjectivesNext={doMergeObjectivesNext}
              />
            </DndContext>

            <div className="ktp-export-block">
              <div className="ktp-export-head">Экспорт</div>
              <div className="ktp-export-buttons">
                <button className="btn btn-export" onClick={exportWord}>Word</button>
                <button className="btn btn-export" onClick={() => exportXlsx(false)}>XLSX</button>
                <button className="btn btn-export" onClick={() => exportXlsx(true)}>Кунделик</button>
              </div>
            </div>

            <div className="empty" style={{ marginTop: 12 }}>
              Перетаскивайте строку за ручку «⠿» для смены порядка уроков (только внутри раздела и четверти); цель —
              перетащите на ячейку целей другого урока, чтобы объединить цели в нём. Двойной клик по ячейке — правка.
            </div>
          </>
        )}

        {mergeFor && (
          <div className="modal-overlay" onClick={() => setMergeFor(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Объединить уроки</h3>
              <p>Укажите причину объединения:</p>
              <input
                className="filter-select"
                style={{ width: "100%" }}
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setMergeFor(null)}>Отмена</button>
                <button className="btn btn-sm btn-primary" onClick={confirmMerge}>Объединить</button>
              </div>
            </div>
          </div>
        )}

        {templateFor && (
          <div className="modal-overlay" onClick={() => setTemplateFor(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Сохранить как шаблон</h3>
              <p>Шаблон можно будет клонировать на параллельный класс из списка КТП.</p>
              <input
                className="filter-select"
                style={{ width: "100%" }}
                placeholder="Название шаблона"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setTemplateFor(false)}>Отмена</button>
                <button className="btn btn-sm btn-primary" disabled={!templateName.trim()} onClick={doSaveTemplate}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {unfilledQuarter != null && (
          <div className="modal-overlay" onClick={() => setUnfilledQuarter(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Незаполненные уроки · {unfilledQuarter}-я четверть</h3>
              {progress.unfilledByQuarter[unfilledQuarter]?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {progress.unfilledByQuarter[unfilledQuarter].map((l) => (
                    <li key={l.id}>
                      №{l.lessonNumber}: {l.lessonTopic || "(без темы)"} — {l.sectionName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Все уроки заполнены.</p>
              )}
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => setUnfilledQuarter(null)}>Закрыть</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function HoursPanel({ report }: { report: ReturnType<typeof validateHours> }) {
  return (
    <div className={`ktp-hours ktp-hours-${report.overallOk ? "ok" : "warn"}`}>
      <div className="ktp-hours-title">
        Часы: норма {report.norm} ч. ({report.hoursPerWeek} ч/нед) · {report.overallMessage}
      </div>
      {report.quarters.map((q) => (
        <div key={q.quarterNumber} className={q.ok ? "" : "ktp-hours-warn"}>
          {q.quarterNumber}-я четв.: {q.message}.
        </div>
      ))}
    </div>
  );
}

function ProgressPanel({
  progress,
  onShowQuarter,
}: {
  progress: { byQuarter: { done: number; total: number }[]; unfilledByQuarter: Record<number, IKtpLesson[]> };
  onShowQuarter: (q: number) => void;
}) {
  const totalDone = progress.byQuarter.reduce((s, q) => s + q.done, 0);
  const total = progress.byQuarter.reduce((s, q) => s + q.total, 0);
  const pct = total === 0 ? 0 : Math.round((totalDone / total) * 100);
  return (
    <div className="ktp-progress">
      <div className="ktp-progress-total">
        Готовность: {totalDone}/{total} ({pct}%)
        <div className="ktp-progress-bar">
          <div className="ktp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {progress.byQuarter.map((q, i) => {
        const qp = q.total === 0 ? 0 : Math.round((q.done / q.total) * 100);
        return (
          <button
            key={i}
            className="ktp-progress-quarter"
            onClick={() => onShowQuarter(i + 1)}
            title={`${i + 1}-я четверть: ${q.done}/${q.total}`}
          >
            {i + 1}·{qp}%
            <div className="ktp-progress-bar">
              <div className="ktp-progress-fill" style={{ width: `${qp}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

import { DndContext, closestCenter } from "@dnd-kit/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Panel } from "../components/ui";
import { SUBJECT_NAMES } from "./SubjectNames";
import { KtpTable } from "../ktp/KtpTable";
import { useKtpEditorState } from "../ktp/useKtpEditorState";
import { adiletAppendixUrl } from "../lib/adilet";
import { sourceDocLabel } from "../lib/sourceDoc";
import { directionLabel, directionWhy, normalizeDirection } from "../domains/tup/labels";
import { KtpHoursPanel } from "../domains/ktp/ui/KtpHoursPanel";
import { KtpProgressPanel } from "../domains/ktp/ui/KtpProgressPanel";
import { KtpInvariantBar } from "../domains/ktp/ui/KtpInvariantBar";
import { KtpQuarterTabs } from "../domains/ktp/ui/KtpQuarterTabs";
import { KtpCalendarStrip } from "../domains/ktp/ui/KtpCalendarStrip";

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
    dbPlan, history, visibleFlat, loading, error, status, toast, busy, daysOfWeek, sourceDoc,
    historyOpen, templateFor, templateName, unfilledQuarter, selectedQuarter, editing, draft, mergeFor, mergeReason,
    setDaysOfWeek, setHistoryOpen, setTemplateFor, setTemplateName, setUnfilledQuarter, setSelectedQuarter, setDraft, setMergeFor, setMergeReason,
    save, recalcSchedule, applyEdit, commitEdit, cancelEdit, tabNext, beginEdit, doAddHour, doDeleteLesson, doSplit, doAddSor, doMergeObjectivesNext,
    handleDragEnd, updateLesson, confirmMerge, doSaveTemplate, exportWord, exportXlsx,
    hoursReport, liveInvariant, quarterCounts, progress, isDirty
  } = useKtpEditorState(planId);
  const direction = sourceDoc ? normalizeDirection(sourceDoc.directionStr) : "common";

  const planName = dbPlan
    ? `${SUBJECT_NAMES[dbPlan.subjectId] ?? dbPlan.subjectId} · ${dbPlan.grade} класс · ${dbPlan.language} · ${dbPlan.academicYear}`
    : "";

  return (
    <Panel
      title="Редактор КТП"
      actions={
        <button
          className="btn btn-sm"
          onClick={() => {
            // Уход из редактора с несохранёнными правками терял работу молча.
            if (isDirty && !window.confirm("В плане есть несохранённые изменения. Выйти без сохранения?")) return;
            onClose();
          }}
        >
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
                <>
                  {direction !== "common" && (
                    <span className="ktp-dir-badge" title={directionWhy(sourceDoc.directionStr)}>
                      {directionLabel(direction)}
                    </span>
                  )}
                  <a
                    className="ktp-source-link"
                    title="Открыть оригинал документа ТУП"
                    onClick={() => openUrl(adiletAppendixUrl(sourceDoc.language, sourceDoc.appendixNumber))}
                  >
                    {sourceDocLabel(sourceDoc)} · [ссылка]
                  </a>
                </>
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
              <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !isDirty}>
                {busy ? "…" : isDirty ? "Сохранить" : "Сохранено"}
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

            <KtpHoursPanel report={hoursReport} />
            <KtpInvariantBar report={liveInvariant} />
            <KtpProgressPanel progress={progress} onShowQuarter={setUnfilledQuarter} />
            <KtpQuarterTabs selected={selectedQuarter} counts={quarterCounts} onSelect={setSelectedQuarter} />
            <KtpCalendarStrip flat={visibleFlat} />

            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <KtpTable
                flat={visibleFlat}
                editing={editing}
                draft={draft}
                setDraft={setDraft}
                beginEdit={beginEdit}
                applyEdit={applyEdit}
                commitEdit={commitEdit}
                cancelEdit={cancelEdit}
                onTabNext={tabNext}
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


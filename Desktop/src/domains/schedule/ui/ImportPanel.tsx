import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { scheduleApi } from "../api";
import type { ExcelImportPreview, ImportSummary } from "../../../types";

/**
 * Импорт учебного плана из Excel.
 *
 * Двухфазный намеренно: заполненная вручную таблица почти всегда содержит
 * опечатки в ФИО и названиях кабинетов, из-за которых рвутся связи между
 * листами. Пользователь видит отчёт до того, как что-либо попадёт в базу.
 */
export function ImportPanel({ onImported }: { onImported: () => void }) {
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async () => {
    setError(null);
    setSummary(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Excel", extensions: ["xlsx", "xlsm"] }],
      });
      if (typeof selected !== "string") return;
      setPath(selected);
      setBusy(true);
      setPreview(await scheduleApi.previewExcel(selected));
    } catch (e) {
      setError(String(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(await scheduleApi.importExcel(path));
      setPreview(null);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const withRoom = preview?.teachers.filter((t) => t.base_room_name).length ?? 0;
  const jointGroups = new Set(
    (preview?.curriculum ?? []).map((c) => c.joint_lesson_id).filter(Boolean),
  ).size;

  return (
    <div className="stack-md">
      <section className="card">
        <h3>Импорт учебного плана из Excel</h3>
        <p className="muted">
          Заполните шаблон «Учебный_план_и_нагрузка» и загрузите его. Данные
          справочников будут обновлены, нагрузка — заменена целиком. Матрицы
          доступности учителей, заданные в приложении, сохранятся.
        </p>
        <div className="row gap-sm">
          <button className="btn" onClick={pickFile} disabled={busy}>
            {busy && !summary ? "Читаю файл..." : "Выбрать файл Excel"}
          </button>
          {path && <span className="muted ellipsis" title={path}>{path}</span>}
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </section>

      {summary && (
        <section className="card success">
          <h3>Импорт завершён</h3>
          <div className="stat-row">
            <Stat label="Кабинеты" value={summary.rooms} />
            <Stat label="Учителя" value={summary.teachers} />
            <Stat label="Классы" value={summary.classes} />
            <Stat label="Предметы" value={summary.subjects} />
            <Stat label="Нагрузка" value={summary.curriculum} />
            {summary.skipped > 0 && <Stat label="Пропущено" value={summary.skipped} warn />}
          </div>
          {summary.skipped > 0 && (
            <p className="muted">
              Пропущенные строки ссылались на учителя или класс, которых нет в
              справочниках. Исправьте их в таблице и повторите импорт.
            </p>
          )}
        </section>
      )}

      {preview && (
        <>
          <section className="card">
            <h3>Что нашлось в файле</h3>
            <div className="stat-row">
              <Stat label="Кабинеты" value={preview.rooms.length} />
              <Stat label="Учителя" value={preview.teachers.length} />
              <Stat label="Классы" value={preview.classes.length} />
              <Stat label="Нагрузка" value={preview.curriculum.length} />
              <Stat label="Класс-комплекты" value={jointGroups} />
              <Stat
                label="С кабинетом"
                value={`${withRoom} / ${preview.teachers.length}`}
                warn={withRoom === 0}
              />
            </div>
            {withRoom === 0 && preview.teachers.length > 0 && (
              <p className="muted">
                Ни у одного учителя не указан закреплённый кабинет. Без этого
                почти каждый урок можно поставить в любой кабинет, и расчёт
                расписания идёт значительно дольше.
              </p>
            )}
          </section>

          {preview.problems.length > 0 && (
            <section className="card error-soft">
              <h3>Проблемы ({preview.problems.length})</h3>
              <p className="muted">
                Эти строки не попадут в базу. Исправьте их в таблице и загрузите
                файл заново.
              </p>
              <ul className="issue-list">
                {preview.problems.slice(0, 40).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              {preview.problems.length > 40 && (
                <p className="muted">…и ещё {preview.problems.length - 40}</p>
              )}
            </section>
          )}

          {preview.warnings.length > 0 && (
            <section className="card warn-soft">
              <h3>Замечания ({preview.warnings.length})</h3>
              <ul className="issue-list">
                {preview.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="row gap-sm">
              <button
                className="btn primary"
                onClick={doImport}
                disabled={busy || preview.curriculum.length === 0}
              >
                {busy ? "Импортирую..." : "Импортировать в базу"}
              </button>
              <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
                Отмена
              </button>
            </div>
            {preview.problems.length > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Импорт можно выполнить и сейчас — проблемные строки будут
                пропущены.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={warn ? "stat stat-warn" : "stat"}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

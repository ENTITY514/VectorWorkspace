import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../../services/api";
import type { TupImportResult } from "../../../types";

/**
 * Загрузка нормативного базиса (ТУП).
 *
 * Команды импорта существовали в ядре с самого начала, но вызвать их из
 * приложения было нельзя — данные попадали в базу только отдельной
 * консольной утилитой. Без ТУП нет целей обучения, а значит и КТП.
 */
export function TupImportPanel({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TupImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "html" | "json") => {
    setError(null);
    setResult(null);
    try {
      const selected = await open({
        multiple: false,
        filters:
          kind === "json"
            ? [{ name: "JSON", extensions: ["json"] }]
            : [{ name: "HTML документа ТУП", extensions: ["html", "htm", "txt"] }],
      });
      if (typeof selected !== "string") return;
      setBusy(true);
      const res =
        kind === "json"
          ? await api.importTupJson(selected)
          : await api.importTup(selected);
      setResult(res);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const totalObjectives = (result ?? []).reduce((n, r) => n + r.objectivesImported, 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Загрузка ТУП</h3>
      <p className="muted">
        Типовые учебные программы — источник целей обучения. Из них строится
        КТП, поэтому их нужно загрузить до создания планов. Повторный импорт
        уже загруженного документа его не затирает.
      </p>
      <div className="row gap-sm">
        <button className="btn" onClick={() => run("html")} disabled={busy}>
          {busy ? "Импортирую..." : "Импорт из HTML"}
        </button>
        <button className="btn" onClick={() => run("json")} disabled={busy}>
          Импорт из JSON
        </button>
      </div>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div className="card success" style={{ marginTop: 12 }}>
          {result.length === 0 ? (
            <p className="muted">
              Новых документов не найдено — вероятно, они уже загружены.
            </p>
          ) : (
            <>
              <p>
                Загружено документов: <b>{result.length}</b>, целей обучения:{" "}
                <b>{totalObjectives}</b>.
              </p>
              <ul className="issue-list">
                {result.slice(0, 20).map((r) => (
                  <li key={r.documentId}>
                    {r.subjectId} · {r.targetGrades} класс — {r.objectivesImported} целей
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { openUrl } from "@tauri-apps/plugin-opener";
import { adiletAppendixUrl, appendixLabel } from "../../../lib/adilet";

export function KtpPendingModal({ hook }: { hook: any }) {
  const { pendingDoc, setPendingDoc, generate } = hook;
  if (!pendingDoc) return null;

  return (
    <div className="modal-overlay" onClick={() => setPendingDoc(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Проверьте документ ТУП перед созданием</h3>
        <p>
          Данные ТУП были извлечены из файла автоматически и могут содержать ошибки разбора. Перед созданием
          КТП рекомендуется сверить цели обучения с оригиналом документа.
        </p>
        <p>
          Источник: приказ МОН РК от {pendingDoc.orderDate} № {pendingDoc.orderNumber} ·{" "}
          {appendixLabel(pendingDoc.appendixNumber)} ·{" "}
          <a
            className="ktp-source-link"
            onClick={() => openUrl(adiletAppendixUrl(pendingDoc.language, pendingDoc.appendixNumber))}
          >
            открыть оригинал
          </a>
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-sm" onClick={() => setPendingDoc(null)}>Отмена</button>
          <button className="btn btn-sm btn-primary" onClick={() => generate(pendingDoc.id)}>
            Создать КТП
          </button>
        </div>
      </div>
    </div>
  );
}

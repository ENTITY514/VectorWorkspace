import { openUrl } from "@tauri-apps/plugin-opener";
import { adiletAppendixUrl, appendixLabel } from "../../../lib/adilet";
import { WEEKDAYS, YEAR_WEEKS, type KtpListHook } from "../useKtpList";

export function KtpPendingModal({ hook }: { hook: KtpListHook }) {
  const { pendingDoc, setPendingDoc, generate, academicYear, daysOfWeek, hoursPerWeek, expectedHours, duplicates } = hook;
  if (!pendingDoc) return null;

  const days = daysOfWeek.map((n) => WEEKDAYS[n - 1]?.label ?? n).join(", ");

  return (
    <div className="modal-overlay" onClick={() => setPendingDoc(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Проверьте документ ТУП перед созданием</h3>
        <p>
          Данные ТУП извлечены автоматически и могут содержать ошибки разбора. Перед созданием
          КТП сверьте цели обучения с оригиналом.
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
        <p className="muted">
          Учебный год {academicYear} · дни: {days}
          {hoursPerWeek != null && expectedHours != null
            ? ` · норма ${hoursPerWeek} ч/нед × ${YEAR_WEEKS} нед. = ${expectedHours} ч.`
            : ""}
        </p>
        {duplicates.length > 0 && (
          <p className="ktp-hint ktp-hint-warn">
            Уже есть {duplicates.length} план(ов) на этот предмет, класс и год. Будет создан ещё один.
          </p>
        )}
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

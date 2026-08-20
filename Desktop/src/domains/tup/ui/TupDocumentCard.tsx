import { openUrl } from "@tauri-apps/plugin-opener";
import type { TupDocumentListItem } from "../../../types";
import { adiletAppendixUrl } from "../../../lib/adilet";

export function TupDocumentCard({ doc, onClick }: { doc: TupDocumentListItem; onClick: () => void }) {
  const dirClass = doc.directionStr === "ЕМН" ? "doc-badge-emn" : doc.directionStr === "ОГН" ? "doc-badge-ogn" : "";
  const langClass = doc.language === "kz" ? "doc-badge-kz" : "doc-badge-ru";
  
  return (
    <button className="doc-card" onClick={onClick}>
      <div className="doc-card-header">
        <span className="doc-subject">{doc.subjectName}</span>
        <span style={{ display: "flex", gap: 4 }}>
          <span className={`doc-badge ${langClass}`}>{doc.language?.toUpperCase() ?? "RU"}</span>
          <span className={`doc-badge ${dirClass}`}>{doc.directionStr}</span>
        </span>
      </div>
      <div className="doc-card-body">
        <div className="doc-grades">{doc.targetGrades}</div>
        <div className="doc-meta">Прил. {doc.appendixNumber} · {doc.orderDate}</div>
        <div className="doc-meta">приказ МОН РК от {doc.orderDate} № {doc.orderNumber}</div>
        <div className="doc-stats">
          <span>{doc.objectiveCount} целей</span>
          {doc.hasDsp && <span className="dsp-badge">ДСП</span>}
          <a
            className="doc-link"
            title="Открыть приложение в adilet"
            onClick={(e) => {
              e.stopPropagation();
              openUrl(adiletAppendixUrl(doc.language, doc.appendixNumber));
            }}
          >
            оригинал ↗
          </a>
        </div>
      </div>
    </button>
  );
}

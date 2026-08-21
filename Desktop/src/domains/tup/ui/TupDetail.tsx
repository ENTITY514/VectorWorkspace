import { useTupDetail } from "../useTupDetail";
import { Stat } from "../../../shared/ui/Stat";
import { TupParagraph1 } from "./TupParagraph1";
import { TupParagraph2 } from "./TupParagraph2";
import { TupParagraph3 } from "./TupParagraph3";
import { TupHours } from "./TupHours";
import { directionLabel, directionFull, languageLabel } from "../labels";

export function TupDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const {
    detail, loading, error, lang, t, subjectName_,
    objectivesByGrade, objectivesByCode, exportWholeDocument
  } = useTupDetail(id);

  if (loading) return <div className="empty">Загрузка документа...</div>;
  if (error) return <div className="flash-error">{error}</div>;
  if (!detail) return null;

  return (
    <div className="tup-detail">
      <button className="btn btn-sm" onClick={onClose} style={{ marginBottom: 16 }}>
        {t.back}
      </button>

      <div className="doc-header">
        <div className="block-header">
          <h2>{subjectName_}</h2>
          {exportWholeDocument && (
            <button className="btn btn-sm" onClick={() => exportWholeDocument()}>
              {lang === "kz" ? "Excel-ге толық экспорт" : "Экспортировать весь документ в Excel"}
            </button>
          )}
        </div>
        <div className="doc-meta-row">
          <span><b>{t.grades}:</b> {detail.targetGrades}</span>
          <span><b>{t.direction}:</b> <span title={directionFull(detail.direction)}>{directionLabel(detail.direction)}</span></span>
          <span><b>{t.appendix}:</b> {detail.appendixNumber}</span>
        </div>
        <div className="doc-meta-row">
          <span><b>{t.orderDate}:</b> {detail.orderDate}</span>
          <span><b>{t.lang}:</b> {languageLabel(detail.language)}</span>
        </div>
      </div>

      <TupParagraph1 detail={detail} t={t} />
      
      <TupParagraph2 
        objectivesByGrade={objectivesByGrade} 
        t={t} 
        lang={lang} 
        subjectName_={subjectName_} 
      />
      
      <TupParagraph3 
        detail={detail} 
        objectivesByCode={objectivesByCode} 
        t={t} 
        lang={lang} 
      />

      <TupHours 
        detail={detail} 
        t={t} 
        lang={lang} 
        subjectName_={subjectName_} 
      />

      <div className="stats-row" style={{ marginTop: 24, display: "flex", gap: 16 }}>
        <Stat label={t.totalObjectives} value={String(detail.objectives.length)} />
        {detail.quarters.length > 0 && (
          <Stat label={t.quartersCount} value={String(detail.quarters.reduce((s, q) => s + q.sections.length, 0))} />
        )}
      </div>
    </div>
  );
}
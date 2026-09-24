import type { KspValidationReport } from "../../../types";

export function KspTimingBar({
  total,
  target,
  report,
  onRebalance,
}: {
  total: number;
  target: number;
  report: KspValidationReport | null;
  onRebalance?: () => void;
}) {
  const ok = total === target;
  const over = total > target;
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
  const tone = ok ? "ok" : over ? "bad" : "warn";
  const blocking = report?.issues.filter((i) => i.level === "blocking").length ?? 0;
  const warns = report?.issues.filter((i) => i.level === "warning").length ?? 0;

  return (
    <div className={`ksp-timing ksp-timing-${tone}`}>
      <div className="ksp-timing-meta">
        <strong>{total} / {target} мин</strong>
        <span>
          {ok ? "хронометраж сходится" : over ? `лишние ${total - target} мин` : `не распределены ${target - total} мин`}
        </span>
        {blocking > 0 && <span className="ksp-timing-flag">блокирующих: {blocking}</span>}
        {warns > 0 && <span>замечаний: {warns}</span>}
      </div>
      <div className="ksp-timing-track">
        <div className="ksp-timing-fill" style={{ width: `${pct}%` }} />
      </div>
      {!ok && onRebalance && (
        <button className="btn btn-sm" onClick={onRebalance}>Разложить минуты по этапам</button>
      )}
    </div>
  );
}

import type { IKtpLesson } from "../../../ktp/model/types";

export function KtpProgressPanel({
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

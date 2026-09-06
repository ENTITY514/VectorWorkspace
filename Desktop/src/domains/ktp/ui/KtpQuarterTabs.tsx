export function KtpQuarterTabs({
  selected,
  counts,
  onSelect,
}: {
  selected: number;
  counts: number[];
  onSelect: (q: number) => void;
}) {
  const total = counts.reduce((s, n) => s + n, 0);
  return (
    <div className="ktp-quarter-tabs" role="tablist" aria-label="Четверти">
      <button
        type="button"
        role="tab"
        aria-selected={selected === 0}
        className={selected === 0 ? "ktp-quarter-tab is-active" : "ktp-quarter-tab"}
        onClick={() => onSelect(0)}
      >
        Все · {total}
      </button>
      {counts.map((n, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={selected === i + 1}
          className={selected === i + 1 ? "ktp-quarter-tab is-active" : "ktp-quarter-tab"}
          onClick={() => onSelect(i + 1)}
        >
          {i + 1}-я · {n}
        </button>
      ))}
    </div>
  );
}

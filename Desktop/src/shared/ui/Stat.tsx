
export function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "blue" | "gray" | "red" }) {
  return (
    <div className={`stat-card ${tone ? `stat-${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

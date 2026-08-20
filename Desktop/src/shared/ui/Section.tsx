
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="block-header">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

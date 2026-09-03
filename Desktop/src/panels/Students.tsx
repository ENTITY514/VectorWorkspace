import { Panel } from "../components/ui";

export function Students() {
  return (
    <Panel
      title="Индивидуальная работа"
      subtitle="Листы отработки по итогам диагностики"
    >
      <div className="panel-body">
        <div className="empty">
          <p>Раздел ещё не реализован.</p>
          <p className="muted">
            Листы отработки строятся по результатам СОР: сначала должен
            появиться раздел суммативного оценивания.
          </p>
        </div>
      </div>
    </Panel>
  );
}

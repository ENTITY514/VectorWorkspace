import { Panel } from "../components/ui";

export function Lessons() {
  return (
    <Panel
      title="Краткосрочные планы (КСП)"
      subtitle="По форме приказа МОН РК № 130"
    >
      <div className="panel-body">
        <div className="empty">
          КСП будут строиться из уроков КТП. Контур подключается в Фазе 5 (каркас КСП) и Фазе 9 (генерация с ИИ).
        </div>
      </div>
    </Panel>
  );
}

import { Panel } from "../components/ui";

export function Students() {
  return (
    <Panel
      title="Индивидуальная работа"
      subtitle="Генерация листов отработки по диагностике СОР"
    >
      <div className="panel-body">
        <div className="empty">
          Листы отработки строятся по диагностике СОР. Контур подключается в Фазе 6.
        </div>
      </div>
    </Panel>
  );
}

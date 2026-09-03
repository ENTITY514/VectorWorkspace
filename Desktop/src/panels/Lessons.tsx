import { Panel } from "../components/ui";

export function Lessons() {
  return (
    <Panel
      title="Краткосрочные планы (КСП)"
      subtitle="По форме приказа МОН РК № 130"
    >
      <div className="panel-body">
        <div className="empty">
          <p>Раздел ещё не реализован.</p>
          <p className="muted">
            КСП строится из урока КТП: тема, раздел и цели обучения
            наследуются оттуда, вручную задаются этапы урока, действия
            учителя и ученика, дескрипторы оценивания.
          </p>
          <p className="muted">
            Пока пользуйтесь редактором КТП — он готов и позволяет
            выгрузить план в Word и Excel.
          </p>
        </div>
      </div>
    </Panel>
  );
}

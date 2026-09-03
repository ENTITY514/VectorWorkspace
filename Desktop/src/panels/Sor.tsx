import { Panel } from "../components/ui";

export function Sor() {
  return (
    <Panel
      title="СОР / СОЧ"
      subtitle="Суммативное оценивание"
    >
      <div className="panel-body">
        <div className="empty">
          <p>Раздел ещё не реализован.</p>
          <p className="muted">
            Спецификации СОР и СОЧ, дескрипторы и баллы уже заложены в
            схему базы, но интерфейс работы с ними не сделан. Уроки типа
            СОР и СОЧ при этом уже размечаются в редакторе КТП.
          </p>
        </div>
      </div>
    </Panel>
  );
}

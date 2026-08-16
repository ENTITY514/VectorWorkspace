import { Panel } from "../components/ui";

export function Sor() {
  return (
    <>
      <Panel
        title="СОР / СОЧ"
        subtitle="Суммативное оценивание — анализ и загрузка"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm">Загрузить результаты</button>
            <button className="btn btn-sm">Анализ</button>
          </div>
        }
      >
        <div className="panel-body">
          <div className="empty">
            СОР/СОЧ строятся из спецификаций и КТП. Контур подключается в Фазе 6.
          </div>
        </div>
      </Panel>
    </>
  );
}

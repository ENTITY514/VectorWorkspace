import { Panel } from "../components/ui";

export function Library() {
  return (
    <Panel
      title="Библиотека заданий"
      subtitle="Задания из учебников, привязанные к целям обучения"
    >
      <div className="panel-body">
        <div className="empty">
          <p>Раздел ещё не реализован.</p>
          <p className="muted">
            Наполнение требует разбора учебников: текст и формулы
            извлекаются из PDF, задания привязываются к целям обучения из
            ТУП. Пока задания в приложении не хранятся.
          </p>
        </div>
      </div>
    </Panel>
  );
}

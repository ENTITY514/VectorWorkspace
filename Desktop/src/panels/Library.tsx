import { Panel } from "../components/ui";

export function Library() {
  return (
    <Panel
      title="Библиотека заданий"
      subtitle="Задания из учебников, тегированные по ЦО"
    >
      <div className="panel-body">
        <div className="empty">
          Библиотека наполняется из базы знаний учебников. Контур подключается в Фазе 7 (индексатор PDF).
        </div>
      </div>
    </Panel>
  );
}

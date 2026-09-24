import { Panel } from "../../../components/ui";
import { Stat } from "../../../shared/ui/Stat";
import { useKspList } from "../useKspList";
import { KspCatalog } from "./KspCatalog";
import { KspCreatePanel } from "./KspCreatePanel";

export function KspList({
  onView,
  onEdit,
}: {
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const hook = useKspList(onEdit);
  const { loading, error, stats, load } = hook;

  return (
    <>
      <div className="grid grid-4 ksp-stats">
        <Stat label="КСП" value={String(stats.total)} />
        <Stat label="Черновиков" value={String(stats.drafts)} tone="amber" />
        <Stat label="Готовых" value={String(stats.ready)} tone="green" />
        <Stat label="Уроков без КСП" value={String(stats.freeLessons)} />
      </div>

      <Panel
        title="Краткосрочные планы (КСП)"
        subtitle="Каталог, поиск и сортировка · форма приказа МОН РК № 130"
        actions={<button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? "…" : "Обновить"}</button>}
      >
        <div className="panel-body">
          {error && <div className="flash-error ksp-flash">{error}</div>}
          <KspCreatePanel hook={hook} />
          <KspCatalog hook={hook} onView={onView} onEdit={onEdit} />
        </div>
      </Panel>
    </>
  );
}

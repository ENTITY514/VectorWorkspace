import { Panel } from "../../../components/ui";
import { Stat } from "../../../shared/ui/Stat";
import { useKtpList } from "../useKtpList";
import { KtpCreatePanel } from "./KtpCreatePanel";
import { KtpClonePanel } from "./KtpClonePanel";
import { KtpSavedTable } from "./KtpSavedTable";
import { KtpPendingModal } from "./KtpPendingModal";

export function KtpList({ onOpen }: { onOpen: (id: string) => void }) {
  const hook = useKtpList(onOpen);
  const { error, status, loading, stats, loadAll } = hook;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Планов КТП" value={String(stats.total)} />
        <Stat label="Черновиков" value={String(stats.drafts)} tone="blue" />
        <Stat label="Утверждённых" value={String(stats.approved)} tone="green" />
        <Stat label="Часов в планах" value={String(stats.hours)} />
      </div>

      <Panel
        title="КТП"
        subtitle="Календарно-тематические планы: создать из ТУП, открыть или клонировать"
        actions={
          <button className="btn btn-sm" onClick={loadAll} disabled={loading}>
            {loading ? "…" : "Обновить"}
          </button>
        }
      >
        <div className="panel-body">
          {error && <div className="flash-error" style={{ marginBottom: 12 }}>{error}</div>}
          {status && <div className="flash-info" style={{ marginBottom: 12 }}>{status}</div>}
          {loading && <div className="empty">Загрузка…</div>}
          {!loading && (
            <>
              <KtpCreatePanel hook={hook} />
              <KtpClonePanel hook={hook} />
              <KtpSavedTable hook={hook} onOpen={onOpen} />
            </>
          )}
          <KtpPendingModal hook={hook} />
        </div>
      </Panel>
    </>
  );
}

import { Panel } from "../../../components/ui";
import { useKtpList } from "../useKtpList";
import { KtpCreatePanel } from "./KtpCreatePanel";
import { KtpClonePanel } from "./KtpClonePanel";
import { KtpSavedTable } from "./KtpSavedTable";
import { KtpPendingModal } from "./KtpPendingModal";

export function KtpList({ onOpen }: { onOpen: (id: string) => void }) {
  const hook = useKtpList(onOpen);
  const { error, status, loading } = hook;

  return (
    <Panel title="КТП" subtitle="Список планов: класс, язык, предмет, учебный год">
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
  );
}

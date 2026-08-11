import { Button } from "@elizaos/ui/components/ui/button";
import type {
  AccountPoolResponse,
  RuntimeStatus,
} from "../../shared/contracts";
import {
  NativeAutonomyPanel,
  type NativeAutonomyResponse,
} from "../components/NativeAutonomyPanel";
import {
  type ApiResource,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  RawDataDisclosure,
} from "../lib";

export function RuntimeOverview({
  accountPool,
  autonomy,
  onOpenProviders,
  runtime,
}: {
  accountPool: ApiResource<AccountPoolResponse>;
  autonomy: ApiResource<NativeAutonomyResponse>;
  onOpenProviders?: () => void;
  runtime: ApiResource<RuntimeStatus>;
}) {
  const pooledAccounts = Object.values(
    accountPool.data?.providers ?? {},
  ).flatMap((provider) => provider.accounts);
  const enabledAccounts = pooledAccounts.filter((account) => account.enabled);
  const autonomyPayload = asRecord(autonomy.data?.data);

  if (runtime.loading) return <LoadingBlock label="Loading runtime binding…" />;
  if (runtime.error) {
    return <ErrorBlock error={runtime.error} retry={runtime.reload} />;
  }

  return (
    <div className="runtime-section-stack">
      <div className="runtime-metrics">
        <MetricCard
          label="Provider"
          value={asString(runtime.data?.provider, "Not set")}
        />
        <MetricCard
          label="Model"
          value={asString(runtime.data?.model, "Unknown")}
        />
        <MetricCard
          detail="Spawned coding and research sessions"
          label="Enabled accounts"
          value={enabledAccounts.length}
        />
        <MetricCard
          detail="Official Eliza autonomy service"
          label="Autonomy"
          value={autonomyPayload.running === true ? "Running" : "Manual"}
        />
      </div>

      <div className="runtime-overview-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Spawned agents</span>
              <h2>Account routing</h2>
            </div>
            <Button
              className="text-button"
              disabled={!onOpenProviders}
              onClick={onOpenProviders}
              type="button"
              variant="ghost"
            >
              Manage
            </Button>
          </div>
          {accountPool.loading ? (
            <LoadingBlock label="Loading account routing…" />
          ) : accountPool.error ? (
            <ErrorBlock error={accountPool.error} retry={accountPool.reload} />
          ) : (
            <div className="status-row">
              <div>
                <strong>{enabledAccounts.length} enabled account(s)</strong>
                <small>
                  Applied to spawned build and research sessions, independently
                  of this conversation model.
                </small>
              </div>
              <Badge tone={enabledAccounts.length ? "good" : "warn"}>
                {enabledAccounts.length ? "Ready" : "Connect"}
              </Badge>
            </div>
          )}
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Conversation binding</span>
              <h2>Active provider model</h2>
            </div>
            <Badge>{asString(runtime.data?.provider, "Not set")}</Badge>
          </div>
          <div className="status-row">
            <div>
              <strong>{asString(runtime.data?.model, "Unknown model")}</strong>
              <small>
                {runtime.data?.fallback?.offlineBootstrapMode
                  ? "Offline bootstrap enabled"
                  : "Connected runtime route"}
              </small>
            </div>
            <Badge tone="good">Running</Badge>
          </div>
          <RawDataDisclosure
            label="Startup receipt"
            value={runtime.data?.startup}
          />
        </section>

        <NativeAutonomyPanel autonomy={autonomy} />
      </div>
    </div>
  );
}

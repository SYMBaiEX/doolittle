import type { RuntimeStatus } from "../../shared/contracts";
import type { DashboardAccountPoolSummary } from "../dashboard-helpers";
import { summarizeDashboardValue } from "../dashboard-helpers";
import { asRecord, Badge, ErrorBlock, LoadingBlock } from "../lib";

export function DashboardRuntimeDetails({
  accountPool,
  accountPoolError,
  accountPoolLoading,
  onOpenProviders,
  ownershipCount,
  reloadAccountPool,
  runtime,
  runtimePluginCount,
}: {
  accountPool: DashboardAccountPoolSummary;
  accountPoolError: string;
  accountPoolLoading: boolean;
  onOpenProviders?: () => void;
  ownershipCount: number;
  reloadAccountPool: () => void;
  runtime: RuntimeStatus | null;
  runtimePluginCount: number;
}) {
  return (
    <details className="dashboard-runtime-details">
      <summary>
        <span>
          <strong>Runtime &amp; agent accounts</strong>
          <small>
            {runtime?.provider || "Unknown provider"} ·{" "}
            {runtime?.model || "Unknown model"}
          </small>
        </span>
        <span className="dashboard-runtime-summary-meta">
          {runtimePluginCount} plugins · {ownershipCount} signals ·{" "}
          {accountPool.enabled} accounts
        </span>
      </summary>
      <div className="dashboard-runtime-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Runtime detail</span>
              <h2>Provider assembly</h2>
            </div>
            <Badge
              tone={runtime?.fallback?.offlineBootstrapMode ? "warn" : "good"}
            >
              {runtime?.fallback?.offlineBootstrapMode
                ? "offline bootstrap"
                : "online"}
            </Badge>
          </div>
          {runtime ? (
            <div className="stack-list">
              <div className="status-row">
                <div>
                  <strong>{runtime.provider || "Unknown provider"}</strong>
                  <small>{runtime.model || "Unknown model"}</small>
                </div>
                <Badge tone="good">{runtimePluginCount} plugins</Badge>
              </div>
              {Object.entries(asRecord(runtime.ownership))
                .slice(0, 4)
                .map(([key, value]) => (
                  <div className="status-row" key={key}>
                    <div>
                      <strong>{key}</strong>
                      <small>{summarizeDashboardValue(value)}</small>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <LoadingBlock />
          )}
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Spawned agents</span>
              <h2>Codex &amp; Claude account pool</h2>
            </div>
            <button
              className="text-button"
              disabled={!onOpenProviders}
              onClick={onOpenProviders}
              type="button"
            >
              Manage
            </button>
          </div>
          {accountPoolLoading ? (
            <LoadingBlock />
          ) : accountPoolError ? (
            <ErrorBlock error={accountPoolError} retry={reloadAccountPool} />
          ) : (
            <div className="status-row">
              <div>
                <strong>
                  {accountPool.enabled} enabled account
                  {accountPool.enabled === 1 ? "" : "s"}
                </strong>
                <small>Used for spawned build and research sessions.</small>
              </div>
              <Badge tone={accountPool.providersReady > 0 ? "good" : "warn"}>
                {accountPool.providersReady > 0
                  ? accountPool.strategies.join(" · ")
                  : "Connect accounts"}
              </Badge>
            </div>
          )}
        </section>
      </div>
    </details>
  );
}

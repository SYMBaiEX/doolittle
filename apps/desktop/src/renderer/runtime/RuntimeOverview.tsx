import { Button } from "@elizaos/ui/components/ui/button";
import type {
  AccountPoolResponse,
  RuntimeStatus,
} from "../../shared/contracts";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  NativeAutonomyPanel,
  type NativeAutonomyResponse,
} from "../components/NativeAutonomyPanel";
import { OfflineRouteState } from "../components/OfflineRouteState";
import {
  type ApiResource,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  RawDataDisclosure,
} from "../lib";

export function RuntimeOverview({
  active = true,
  accountPool,
  autonomy,
  onOpenProviders,
  runtime,
}: {
  active?: boolean;
  accountPool: ApiResource<AccountPoolResponse>;
  autonomy: ApiResource<NativeAutonomyResponse>;
  onOpenProviders?: () => void;
  runtime: ApiResource<RuntimeStatus>;
}) {
  if (!active) {
    return (
      <OfflineRouteState>
        Runtime overview is unavailable until the local runtime is ready.
      </OfflineRouteState>
    );
  }

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
      <CompactStatStrip
        label="Runtime summary"
        stats={[
          {
            label: "Provider",
            value: asString(runtime.data?.provider, "Not set"),
          },
          { label: "Model", value: asString(runtime.data?.model, "Unknown") },
          {
            detail: "Coding and research sessions",
            label: "Enabled accounts",
            tone: enabledAccounts.length ? "good" : "warn",
            value: enabledAccounts.length,
          },
          {
            detail: "Official Eliza service",
            label: "Autonomy",
            tone: autonomyPayload.running === true ? "good" : "neutral",
            value: autonomyPayload.running === true ? "Running" : "Manual",
          },
        ]}
      />

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
                  Spawned build and research sessions; separate from this
                  conversation.
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
              <h2>Conversation model</h2>
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

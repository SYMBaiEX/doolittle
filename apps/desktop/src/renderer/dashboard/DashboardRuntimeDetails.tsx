import { Button } from "@elizaos/ui/components/ui/button";
import type { RuntimeStatus } from "../../shared/contracts";
import type { DashboardAccountPoolSummary } from "../dashboard-helpers";
import { summarizeDashboardValue } from "../dashboard-helpers";
import { asRecord, Badge, ErrorBlock, LoadingBlock } from "../lib";
import {
  DASHBOARD_CARD_CLASS,
  DASHBOARD_CARD_HEADING_CLASS,
  DASHBOARD_DISCLOSURE_CLASS,
  DASHBOARD_STATUS_ROW_CLASS,
  DASHBOARD_SUMMARY_CLASS,
} from "./dashboard-layout";

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
    <details
      className={`dashboard-workspace-details ${DASHBOARD_DISCLOSURE_CLASS}`}
    >
      <summary className={DASHBOARD_SUMMARY_CLASS}>
        <span className="grid min-w-0 gap-0.5">
          <strong>Runtime &amp; agent accounts</strong>
          <small>
            {runtime?.provider || "Unknown provider"} ·{" "}
            {runtime?.model || "Unknown model"}
          </small>
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--text-meta)] text-[var(--muted)] max-[620px]:hidden">
          {runtimePluginCount} plugins · {ownershipCount} signals ·{" "}
          {accountPool.enabled} accounts
        </span>
        <span
          aria-hidden="true"
          className="font-[var(--font-mono)] text-[var(--muted)] group-open:hidden"
        >
          +
        </span>
        <span
          aria-hidden="true"
          className="hidden font-[var(--font-mono)] text-[var(--muted)] group-open:inline"
        >
          −
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-2.5 p-2.5 max-[980px]:grid-cols-1">
        <section className={DASHBOARD_CARD_CLASS}>
          <div className={DASHBOARD_CARD_HEADING_CLASS}>
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
            <div className="grid">
              <div className={DASHBOARD_STATUS_ROW_CLASS}>
                <div>
                  <strong>{runtime.provider || "Unknown provider"}</strong>
                  <small>{runtime.model || "Unknown model"}</small>
                </div>
                <Badge tone="good">{runtimePluginCount} plugins</Badge>
              </div>
              {Object.entries(asRecord(runtime.ownership))
                .slice(0, 4)
                .map(([key, value]) => (
                  <div className={DASHBOARD_STATUS_ROW_CLASS} key={key}>
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

        <section className={DASHBOARD_CARD_CLASS}>
          <div className={DASHBOARD_CARD_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Spawned agents</span>
              <h2>Codex &amp; Claude account pool</h2>
            </div>
            <Button
              disabled={!onOpenProviders}
              onClick={onOpenProviders}
              size="sm"
              type="button"
              variant="ghost"
            >
              Manage
            </Button>
          </div>
          {accountPoolLoading ? (
            <LoadingBlock />
          ) : accountPoolError ? (
            <ErrorBlock error={accountPoolError} retry={reloadAccountPool} />
          ) : (
            <div className={DASHBOARD_STATUS_ROW_CLASS}>
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

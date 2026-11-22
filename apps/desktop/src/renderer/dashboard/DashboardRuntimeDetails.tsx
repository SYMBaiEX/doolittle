import { ChevronRight, Cpu, Link2 } from "lucide-react";
import type { RuntimeStatus } from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import {
  WorkbenchAction,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import type { DashboardAccountPoolSummary } from "../dashboard-helpers";
import { summarizeDashboardValue } from "../dashboard-helpers";
import { asRecord, Badge, ErrorBlock, LoadingBlock } from "../lib";
import {
  DASHBOARD_DISCLOSURE_CLASS,
  DASHBOARD_SPLIT_CLASS,
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
        <UiIcon
          className="text-[var(--muted)] group-open:rotate-90"
          icon={ChevronRight}
        />
      </summary>
      <div className={`${DASHBOARD_SPLIT_CLASS} mt-2`}>
        <WorkbenchSection
          actions={
            <Badge
              tone={
                !runtime
                  ? "neutral"
                  : runtime.fallback?.offlineBootstrapMode
                    ? "warn"
                    : "good"
              }
            >
              {!runtime
                ? "Checking"
                : runtime.fallback?.offlineBootstrapMode
                  ? "Offline bootstrap"
                  : "Online"}
            </Badge>
          }
          icon={Cpu}
          title="Provider assembly"
        >
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
        </WorkbenchSection>

        <WorkbenchSection
          actions={
            <WorkbenchAction
              disabled={!onOpenProviders}
              emphasis="quiet"
              onClick={onOpenProviders}
            >
              Manage
            </WorkbenchAction>
          }
          icon={Link2}
          title="Codex & Claude account pool"
        >
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
        </WorkbenchSection>
      </div>
    </details>
  );
}

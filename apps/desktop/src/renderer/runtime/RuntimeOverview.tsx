import { Cable, Route } from "lucide-react";
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
  WorkbenchAction,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  type ApiResource,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  RawDataDisclosure,
} from "../lib";
import { DiagnosticStatusRow } from "../runtime-state/DiagnosticWorkspace";

export function RuntimeOverview({
  active = true,
  accountPool,
  autonomy,
  onOpenProviders,
  runtime,
  readOnly = false,
}: {
  active?: boolean;
  accountPool: ApiResource<AccountPoolResponse>;
  autonomy: ApiResource<NativeAutonomyResponse>;
  onOpenProviders?: () => void;
  runtime: ApiResource<RuntimeStatus>;
  readOnly?: boolean;
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
    <div className="grid min-h-0 gap-3">
      <div className="diagnostic-workspace__stats">
        <CompactStatStrip
          label="Runtime summary"
          stats={[
            {
              label: "Provider",
              value: asString(runtime.data?.provider, "Not set"),
            },
            { label: "Model", value: asString(runtime.data?.model, "Unknown") },
            {
              label: "Agent accounts",
              tone:
                accountPool.loading || accountPool.error
                  ? "neutral"
                  : enabledAccounts.length
                    ? "good"
                    : "warn",
              pending: accountPool.loading,
              value: accountPool.error ? "Unavailable" : enabledAccounts.length,
            },
            {
              label: "Autonomy",
              tone:
                autonomyPayload.running === true &&
                !autonomy.loading &&
                !autonomy.error
                  ? "good"
                  : "neutral",
              pending: autonomy.loading,
              value: autonomy.error
                ? "Unavailable"
                : autonomyPayload.running === true
                  ? "Running"
                  : "Manual",
            },
          ]}
        />
      </div>

      <div
        className="runtime-overview-grid diagnostic-workspace__grid"
        data-runtime-layout="overview-grid"
      >
        <WorkbenchSection
          actions={
            onOpenProviders ? (
              <WorkbenchAction
                emphasis="quiet"
                icon={Cable}
                onClick={onOpenProviders}
              >
                Manage providers
              </WorkbenchAction>
            ) : null
          }
          description="Accounts available to spawned build and research sessions."
          headingLevel={3}
          icon={Route}
          title="Account routing"
        >
          {accountPool.loading ? (
            <LoadingBlock label="Loading account routing…" />
          ) : accountPool.error ? (
            <ErrorBlock error={accountPool.error} retry={accountPool.reload} />
          ) : (
            <DiagnosticStatusRow
              title={`${enabledAccounts.length} enabled account${enabledAccounts.length === 1 ? "" : "s"}`}
              status={
                <Badge tone={enabledAccounts.length ? "good" : "warn"}>
                  {enabledAccounts.length ? "Ready" : "Connect"}
                </Badge>
              }
            />
          )}
        </WorkbenchSection>

        <NativeAutonomyPanel autonomy={autonomy} readOnly={readOnly} />
      </div>

      <RawDataDisclosure
        label="Startup receipt"
        value={runtime.data?.startup}
      />
    </div>
  );
}

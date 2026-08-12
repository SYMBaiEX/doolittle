import { useMemo } from "react";
import type {
  AccountPoolResponse,
  RuntimeStatus,
  SessionSummary,
} from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { DashboardActivityPanels } from "./dashboard/DashboardActivityPanels";
import { DashboardPriorityPanel } from "./dashboard/DashboardPriorityPanel";
import { DashboardRuntimeDetails } from "./dashboard/DashboardRuntimeDetails";
import {
  buildNextActions,
  countOwnershipSignals,
  countRuntimePlugins,
  normalizeApprovals,
  normalizeSessions,
  normalizeTasks,
  sessionCountSummary,
  summarizeAccountPool,
  summarizeRepoStatus,
  summarizeSetupEntries,
  summarizeSetupHealth,
} from "./dashboard-helpers";
import "./dashboard.css";
import {
  type ApiResource,
  asArray,
  asString,
  compactNumber,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";

interface RepoStatusResponse {
  status?: string;
}

interface SetupSummaryResponse {
  summary?: unknown;
}

export function DashboardPage({
  active,
  approvalsResource: approvals,
  tasksResource: tasks,
  runtime,
  sessions,
  refreshRuntime,
  onOpenChat,
  onOpenReview,
  onOpenTasks,
  onOpenSetup,
  onOpenProviders,
}: {
  active: boolean;
  approvalsResource: ApiResource<{ approvals?: unknown[] }>;
  tasksResource: ApiResource<{ tasks?: unknown[] }>;
  runtime: RuntimeStatus | null;
  sessions: readonly SessionSummary[];
  refreshRuntime: () => Promise<boolean>;
  onOpenChat?: (sessionId?: string) => void;
  onOpenReview?: () => void;
  onOpenTasks?: () => void;
  onOpenSetup?: () => void;
  onOpenProviders?: () => void;
}) {
  const repoStatus = useApiResource<RepoStatusResponse>(
    active ? "/repo/status" : null,
    [active],
  );
  const setup = useApiResource<SetupSummaryResponse>(
    active ? "/setup/summary" : null,
    [active],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    active ? "/runtime/account-pool" : null,
    [active],
  );

  const sessionCards = useMemo(() => normalizeSessions(sessions), [sessions]);
  const approvalCards = useMemo(
    () => normalizeApprovals(asArray(approvals.data?.approvals)),
    [approvals.data?.approvals],
  );
  const taskCards = useMemo(
    () => normalizeTasks(asArray(tasks.data?.tasks)),
    [tasks.data?.tasks],
  );
  const repo = useMemo(
    () => summarizeRepoStatus(asString(repoStatus.data?.status)),
    [repoStatus.data?.status],
  );
  const setupEntries = useMemo(
    () => summarizeSetupEntries(setup.data?.summary),
    [setup.data?.summary],
  );
  const setupHealth = useMemo(
    () => summarizeSetupHealth(setupEntries),
    [setupEntries],
  );
  const accountPoolSummary = useMemo(
    () => summarizeAccountPool(accountPool.data),
    [accountPool.data],
  );
  const sessionSummary = useMemo(
    () => sessionCountSummary(sessions),
    [sessions],
  );
  const nextActions = useMemo(
    () =>
      buildNextActions({
        pendingApprovals: approvalCards.length,
        runningTasks: taskCards.length,
        repo,
        setupEntries,
        sessions: sessionCards,
        accountPool: accountPoolSummary,
      }),
    [
      accountPoolSummary,
      approvalCards.length,
      repo,
      sessionCards,
      setupEntries,
      taskCards.length,
    ],
  );

  const runtimePluginCount = countRuntimePlugins(runtime?.plugins);
  const ownershipCount = countOwnershipSignals(runtime?.ownership);
  const topLevelErrors = [
    approvals.error,
    tasks.error,
    repoStatus.error,
    setup.error,
    accountPool.error,
  ].filter(Boolean);

  const refresh = () => {
    if (!active) return;
    void refreshRuntime();
    approvals.reload();
    tasks.reload();
    repoStatus.reload();
    setup.reload();
    accountPool.reload();
  };

  if (!active) {
    return (
      <div className="page page-dashboard">
        <PageHeader
          eyebrow="Mission control"
          title="Dashboard"
          description="Current pressure, next actions, and workspace state."
          actions={
            <button className="secondary-button" disabled type="button">
              Refresh
            </button>
          }
        />
        <OfflineRouteState>
          Dashboard data is unavailable until the local runtime is ready.
        </OfflineRouteState>
      </div>
    );
  }

  return (
    <div className="page page-dashboard">
      <PageHeader
        eyebrow="Mission control"
        title="Dashboard"
        description="Current pressure, next actions, and workspace state."
        actions={
          <button className="secondary-button" onClick={refresh} type="button">
            Refresh
          </button>
        }
      />

      {topLevelErrors.length ? (
        <Notice tone="warn">
          Some dashboard panels are degraded. Working data still renders where
          available.
        </Notice>
      ) : null}

      <DashboardPriorityPanel
        agentAccounts={accountPoolSummary.enabled}
        conversations={compactNumber(sessionSummary.total)}
        nextActions={nextActions}
        onOpenChat={onOpenChat}
        onOpenProviders={onOpenProviders}
        onOpenReview={onOpenReview}
        onOpenSetup={onOpenSetup}
        onOpenTasks={onOpenTasks}
        reloadRepo={repoStatus.reload}
        reloadSetup={setup.reload}
        repo={repo}
        repoError={repoStatus.error}
        repoLoading={repoStatus.loading}
        runtimePlugins={compactNumber(runtimePluginCount)}
        sessions={sessionCards}
        setupEntries={setupEntries}
        setupError={setup.error}
        setupLoading={setup.loading}
        setupWarnings={setupHealth.warnings}
      />

      <DashboardActivityPanels
        approvals={approvalCards}
        approvalsError={approvals.error}
        approvalsLoading={approvals.loading}
        onOpenChat={onOpenChat}
        onOpenReview={onOpenReview}
        onOpenTasks={onOpenTasks}
        reloadApprovals={approvals.reload}
        reloadTasks={tasks.reload}
        sessions={sessionCards}
        tasks={taskCards}
        tasksError={tasks.error}
        tasksLoading={tasks.loading}
      />

      <DashboardRuntimeDetails
        accountPool={accountPoolSummary}
        accountPoolError={accountPool.error}
        accountPoolLoading={accountPool.loading}
        onOpenProviders={onOpenProviders}
        ownershipCount={ownershipCount}
        reloadAccountPool={accountPool.reload}
        runtime={runtime}
        runtimePluginCount={runtimePluginCount}
      />
    </div>
  );
}

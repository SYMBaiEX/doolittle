import { useMemo } from "react";
import type {
  AccountPoolResponse,
  RuntimeStatus,
  SessionSummary,
} from "../shared/contracts";
import { CompactStatStrip } from "./components/CompactStatStrip";
import {
  buildNextActions,
  countOwnershipSignals,
  countRuntimePlugins,
  normalizeApprovals,
  normalizeSessions,
  normalizeTasks,
  sessionCountSummary,
  summarizeAccountPool,
  summarizeDashboardValue,
  summarizeRepoStatus,
  summarizeSetupEntries,
  summarizeSetupHealth,
} from "./dashboard-helpers";
import "./dashboard.css";
import {
  type ApiResource,
  asArray,
  asRecord,
  asString,
  Badge,
  compactNumber,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
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

  const sessionCards = useMemo(
    () => normalizeSessions(sessions).slice(0, 8),
    [sessions],
  );
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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Mission control"
        title="Dashboard"
        description="Current pressure, next actions, and workspace state."
        actions={
          <div className="page-actions">
            <button
              className="secondary-button"
              onClick={() => {
                void refreshRuntime();
                approvals.reload();
                tasks.reload();
                repoStatus.reload();
                setup.reload();
                accountPool.reload();
              }}
              type="button"
            >
              Refresh
            </button>
          </div>
        }
      />

      {topLevelErrors.length > 0 ? (
        <Notice tone="warn">
          Some dashboard panels are degraded. Working data still renders where
          available.
        </Notice>
      ) : null}

      <section className="content-card dashboard-hero">
        <div>
          <span className="eyebrow">Operator state</span>
          <h2>
            {!active
              ? "Runtime needs attention."
              : approvalCards.length > 0
                ? "Decisions are waiting."
                : taskCards.length > 0
                  ? "Execution is in motion."
                  : repo.dirty
                    ? "Workspace changed locally."
                    : setupHealth.warnings > 0
                      ? "Setup needs attention."
                      : "Runtime is stable."}
          </h2>
          <p>
            {!active
              ? "Restart the local runtime to unlock conversations, tasks, and provider status."
              : approvalCards.length > 0
                ? "Clear approvals first so blocked commands can continue."
                : taskCards.length > 0
                  ? "Delegated work is active. Keep the queue visible and the repo clean."
                  : repo.dirty
                    ? "The checkout has local edits. Review them before the next heavy run."
                    : setupHealth.warnings > 0
                      ? `${setupHealth.warnings} setup signal${
                          setupHealth.warnings === 1 ? "" : "s"
                        } still need attention before every runtime surface is ready.`
                      : "No immediate blockers surfaced across runtime, setup, or repository state."}
          </p>
          <p className="dashboard-pressure-line">
            <span>{approvalCards.length} approvals</span>
            <span>{taskCards.length} running tasks</span>
            <span>{setupHealth.warnings} setup warnings</span>
          </p>
        </div>
      </section>

      <CompactStatStrip
        label="Workspace summary"
        stats={[
          { label: "Agent accounts", value: accountPoolSummary.enabled },
          {
            label: "Conversations",
            value: compactNumber(sessionSummary.total),
          },
          {
            label: "Runtime plugins",
            value: compactNumber(runtimePluginCount),
          },
          {
            detail: repo.dirty ? `${repo.changedFiles} changed` : "Clean",
            label: "Workspace branch",
            tone: repo.dirty ? "warn" : "good",
            value: repo.branch,
          },
        ]}
      />

      <div className="two-column-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Next actions</span>
              <h2>What to do now</h2>
            </div>
            <Badge tone={nextActions[0]?.tone === "warn" ? "warn" : "good"}>
              {nextActions.length} queued
            </Badge>
          </div>
          <div className="dashboard-action-list">
            {nextActions.map((action) => {
              const handler =
                action.target === "review"
                  ? onOpenReview
                  : action.target === "tasks"
                    ? onOpenTasks
                    : action.target === "setup"
                      ? onOpenSetup
                      : action.target === "providers"
                        ? onOpenProviders
                        : () => onOpenChat?.(sessionCards[0]?.id);
              return (
                <article className="dashboard-action-card" key={action.id}>
                  <header>
                    <strong>{action.title}</strong>
                    <Badge tone={action.tone}>{action.target}</Badge>
                  </header>
                  <p>{action.description}</p>
                  <button
                    className="text-button"
                    disabled={!handler}
                    onClick={() => handler?.()}
                    type="button"
                  >
                    Open
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Workspace pulse</span>
              <h2>Repository and setup</h2>
            </div>
            <Badge tone={repo.dirty || repo.behind > 0 ? "warn" : "good"}>
              {repo.dirty ? "dirty" : "stable"}
            </Badge>
          </div>
          <div className="stack-list">
            <div className="status-row">
              <div>
                <strong>{repo.branch}</strong>
                <small>
                  {repo.upstream
                    ? `${repo.upstream} · ${repo.ahead} ahead · ${repo.behind} behind`
                    : "No upstream detected"}
                </small>
              </div>
              <Badge tone={repo.dirty ? "warn" : "good"}>
                {repo.dirty ? `${repo.changedFiles} changed` : "Clean"}
              </Badge>
            </div>
          </div>
          <details className="dashboard-workspace-details">
            <summary>
              <span>Workspace diagnostics</span>
              <Badge tone={setupHealth.warnings ? "warn" : "good"}>
                {setupHealth.warnings
                  ? `${setupHealth.warnings} warnings`
                  : "Ready"}
              </Badge>
            </summary>
            <div className="stack-list">
              {setupEntries.slice(0, 4).map((entry) => (
                <div className="status-row" key={entry.key}>
                  <div>
                    <strong>{entry.label}</strong>
                    <small>{entry.value}</small>
                  </div>
                  <Badge tone={entry.tone}>{entry.tone}</Badge>
                </div>
              ))}
            </div>
            {repo.lines.length > 0 ? (
              <div className="dashboard-line-list spaced">
                {repo.lines.slice(0, 4).map((line) => (
                  <code key={line}>{line}</code>
                ))}
              </div>
            ) : null}
          </details>
          {repoStatus.loading || setup.loading ? <LoadingBlock /> : null}
          {repoStatus.error ? (
            <ErrorBlock error={repoStatus.error} retry={repoStatus.reload} />
          ) : null}
          {setup.error ? (
            <ErrorBlock error={setup.error} retry={setup.reload} />
          ) : null}
        </section>
      </div>

      <div className="dashboard-mini-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Recent conversations</span>
              <h2>Sessions</h2>
            </div>
            <button
              className="text-button"
              disabled={!onOpenChat}
              onClick={() => onOpenChat?.()}
              type="button"
            >
              Open chat
            </button>
          </div>
          {sessionCards.length ? (
            <div className="stack-list">
              {sessionCards.map((session) => (
                <button
                  className="row-card dashboard-session-button"
                  key={session.id}
                  onClick={() => onOpenChat?.(session.id)}
                  type="button"
                >
                  <span className="row-card-main">
                    <strong>{session.title}</strong>
                    <small>{session.preview}</small>
                  </span>
                  <span className="row-card-meta">
                    <small>{session.messageCount} messages</small>
                    <small>{displayTimestamp(session.lastActivityLabel)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No saved sessions yet">
              Start a conversation to build local history.
            </EmptyBlock>
          )}
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Execution queue</span>
              <h2>Approvals and tasks</h2>
            </div>
            <div className="page-actions">
              <button
                className="text-button"
                disabled={!onOpenReview}
                onClick={onOpenReview}
                type="button"
              >
                Review
              </button>
              <button
                className="text-button"
                disabled={!onOpenTasks}
                onClick={onOpenTasks}
                type="button"
              >
                Tasks
              </button>
            </div>
          </div>
          <div className="stack-list">
            {approvalCards.slice(0, 3).map((approval) => (
              <div className="status-row" key={approval.id}>
                <div>
                  <strong>{approval.command}</strong>
                  <small>
                    {approval.reason} · expires{" "}
                    {displayTimestamp(approval.expiresAt)}
                  </small>
                </div>
                <Badge tone="warn">pending</Badge>
              </div>
            ))}
            {taskCards.slice(0, 4).map((task) => (
              <div className="status-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {task.profile} · {task.priority} · {task.executionMode} ·{" "}
                    {displayTimestamp(task.updatedAt)}
                  </small>
                </div>
                <Badge tone={task.status === "running" ? "good" : "neutral"}>
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
          {approvalCards.length === 0 && taskCards.length === 0 ? (
            <EmptyBlock title="No active execution pressure">
              There are no pending approvals or running delegated tasks.
            </EmptyBlock>
          ) : null}
          {approvals.loading || tasks.loading ? <LoadingBlock /> : null}
          {approvals.error ? (
            <ErrorBlock error={approvals.error} retry={approvals.reload} />
          ) : null}
          {tasks.error ? (
            <ErrorBlock error={tasks.error} retry={tasks.reload} />
          ) : null}
        </section>
      </div>

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
            {accountPoolSummary.enabled} accounts
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
            {accountPool.loading ? (
              <LoadingBlock />
            ) : accountPool.error ? (
              <ErrorBlock
                error={accountPool.error}
                retry={accountPool.reload}
              />
            ) : (
              <div className="status-row">
                <div>
                  <strong>
                    {accountPoolSummary.enabled} enabled account
                    {accountPoolSummary.enabled === 1 ? "" : "s"}
                  </strong>
                  <small>Used for spawned build and research sessions.</small>
                </div>
                <Badge
                  tone={accountPoolSummary.providersReady > 0 ? "good" : "warn"}
                >
                  {accountPoolSummary.providersReady > 0
                    ? accountPoolSummary.strategies.join(" · ")
                    : "Connect accounts"}
                </Badge>
              </div>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

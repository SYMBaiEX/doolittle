import { useMemo } from "react";
import type { RuntimeStatus, SessionsResponse } from "../shared/contracts";
import {
  buildNextActions,
  countOwnershipSignals,
  countRuntimePlugins,
  normalizeApprovals,
  normalizeSessions,
  normalizeTasks,
  sessionCountSummary,
  summarizeDashboardValue,
  summarizeRepoStatus,
  summarizeSetupEntries,
  summarizeSetupHealth,
} from "./dashboard-helpers";
import "./dashboard.css";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  compactNumber,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";

interface ApprovalListResponse {
  approvals?: unknown[];
}

interface DelegationTasksResponse {
  tasks?: unknown[];
}

interface RepoStatusResponse {
  status?: string;
}

interface SetupSummaryResponse {
  summary?: unknown;
}

export function DashboardPage({
  active,
  onOpenChat,
  onOpenReview,
  onOpenTasks,
  onOpenSetup,
}: {
  active: boolean;
  onOpenChat?: (sessionId?: string) => void;
  onOpenReview?: () => void;
  onOpenTasks?: () => void;
  onOpenSetup?: () => void;
}) {
  const runtime = useApiResource<RuntimeStatus>(
    active ? "/runtime/status" : null,
    [active],
  );
  const sessions = useApiResource<SessionsResponse>(
    active ? "/sessions?limit=8" : null,
    [active],
  );
  const approvals = useApiResource<ApprovalListResponse>(
    active ? "/execution/approvals?status=pending" : null,
    [active],
  );
  const tasks = useApiResource<DelegationTasksResponse>(
    active ? "/delegation/tasks?status=running&limit=8" : null,
    [active],
  );
  const repoStatus = useApiResource<RepoStatusResponse>(
    active ? "/repo/status" : null,
    [active],
  );
  const setup = useApiResource<SetupSummaryResponse>(
    active ? "/setup/summary" : null,
    [active],
  );

  const sessionCards = useMemo(
    () => normalizeSessions(sessions.data?.sessions ?? []),
    [sessions.data?.sessions],
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
  const sessionSummary = useMemo(
    () => sessionCountSummary(sessions.data?.sessions),
    [sessions.data?.sessions],
  );
  const nextActions = useMemo(
    () =>
      buildNextActions({
        pendingApprovals: approvalCards.length,
        runningTasks: taskCards.length,
        repo,
        setupEntries,
        sessions: sessionCards,
      }),
    [approvalCards.length, repo, sessionCards, setupEntries, taskCards.length],
  );

  const runtimePluginCount = countRuntimePlugins(runtime.data?.plugins);
  const ownershipCount = countOwnershipSignals(runtime.data?.ownership);
  const topLevelErrors = [
    runtime.error,
    sessions.error,
    approvals.error,
    tasks.error,
    repoStatus.error,
    setup.error,
  ].filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Mission control"
        title="Dashboard"
        description="Runtime health, workspace pressure, active tasks, and next operator actions in one desktop surface."
        actions={
          <div className="page-actions">
            <button
              className="secondary-button"
              onClick={() => {
                runtime.reload();
                sessions.reload();
                approvals.reload();
                tasks.reload();
                repoStatus.reload();
                setup.reload();
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
                    : "No immediate blockers surfaced across runtime, setup, or repository state."}
          </p>
          <div className="dashboard-inline-metrics">
            <div>
              <strong>{runtime.data?.provider || "Unknown"}</strong>
              <span>Provider</span>
            </div>
            <div>
              <strong>{runtime.data?.model || "Unknown"}</strong>
              <span>Model</span>
            </div>
            <div>
              <strong>{repo.branch}</strong>
              <span>Workspace branch</span>
            </div>
          </div>
        </div>
        <div className="dashboard-side-column">
          <div>
            <small>Pending approvals</small>
            <strong>{compactNumber(approvalCards.length)}</strong>
          </div>
          <div>
            <small>Running tasks</small>
            <strong>{compactNumber(taskCards.length)}</strong>
          </div>
          <div>
            <small>Setup warnings</small>
            <strong>{compactNumber(setupHealth.warnings)}</strong>
          </div>
        </div>
      </section>

      <div className="metric-grid compact">
        <MetricCard
          label="Sessions"
          value={compactNumber(sessionSummary.total)}
          detail={`${compactNumber(sessionSummary.messages)} messages stored`}
        />
        <MetricCard
          label="Repo state"
          value={repo.dirty ? "Dirty" : "Clean"}
          detail={`${repo.changedFiles} changed · ${repo.ahead} ahead · ${repo.behind} behind`}
        />
        <MetricCard
          label="Runtime plugins"
          value={compactNumber(runtimePluginCount)}
          detail={`${ownershipCount} ownership signals`}
        />
        <MetricCard
          label="Setup"
          value={setupHealth.warnings > 0 ? "Attention" : "Ready"}
          detail={`${setupHealth.healthy} healthy · ${setupHealth.warnings} warnings`}
        />
      </div>

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
          {sessions.loading ? (
            <LoadingBlock />
          ) : sessions.error ? (
            <ErrorBlock error={sessions.error} retry={sessions.reload} />
          ) : sessionCards.length ? (
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

      <section className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Runtime detail</span>
            <h2>Provider assembly</h2>
          </div>
          <Badge
            tone={
              runtime.data?.fallback?.offlineBootstrapMode ? "warn" : "good"
            }
          >
            {runtime.data?.fallback?.offlineBootstrapMode
              ? "offline bootstrap"
              : "online"}
          </Badge>
        </div>
        {runtime.loading ? (
          <LoadingBlock />
        ) : runtime.error ? (
          <ErrorBlock error={runtime.error} retry={runtime.reload} />
        ) : (
          <div className="stack-list">
            <div className="status-row">
              <div>
                <strong>{runtime.data?.provider || "Unknown provider"}</strong>
                <small>{runtime.data?.model || "Unknown model"}</small>
              </div>
              <Badge tone="good">{runtimePluginCount} plugins</Badge>
            </div>
            {Object.entries(asRecord(runtime.data?.ownership))
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
        )}
      </section>
    </div>
  );
}

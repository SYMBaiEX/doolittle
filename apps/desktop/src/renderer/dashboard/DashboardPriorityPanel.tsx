import { CompactStatStrip } from "../components/CompactStatStrip";
import type {
  DashboardNextAction,
  DashboardRepoSnapshot,
  DashboardSessionCard,
  DashboardSetupEntry,
} from "../dashboard-helpers";
import { Badge, ErrorBlock, LoadingBlock } from "../lib";

export function DashboardPriorityPanel({
  agentAccounts,
  conversations,
  nextActions,
  onOpenChat,
  onOpenProviders,
  onOpenReview,
  onOpenSetup,
  onOpenTasks,
  repo,
  repoError,
  repoLoading,
  reloadRepo,
  reloadSetup,
  runtimePlugins,
  sessions,
  setupEntries,
  setupError,
  setupLoading,
  setupWarnings,
}: {
  agentAccounts: number;
  conversations: string;
  nextActions: DashboardNextAction[];
  onOpenChat?: (sessionId?: string) => void;
  onOpenProviders?: () => void;
  onOpenReview?: () => void;
  onOpenSetup?: () => void;
  onOpenTasks?: () => void;
  repo: DashboardRepoSnapshot;
  repoError: string;
  repoLoading: boolean;
  reloadRepo: () => void;
  reloadSetup: () => void;
  runtimePlugins: string;
  sessions: DashboardSessionCard[];
  setupEntries: DashboardSetupEntry[];
  setupError: string;
  setupLoading: boolean;
  setupWarnings: number;
}) {
  return (
    <>
      <CompactStatStrip
        label="Workspace summary"
        stats={[
          { label: "Agent accounts", value: agentAccounts },
          { label: "Conversations", value: conversations },
          { label: "Runtime plugins", value: runtimePlugins },
          {
            detail: repo.dirty ? `${repo.changedFiles} changed` : "Clean",
            label: "Workspace branch",
            tone: repo.dirty ? "warn" : "good",
            value: repo.branch,
          },
        ]}
      />

      <div className="two-column-grid dashboard-command-grid">
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
                        : () => onOpenChat?.(sessions[0]?.id);
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
              <Badge tone={setupWarnings ? "warn" : "good"}>
                {setupWarnings ? `${setupWarnings} warnings` : "Ready"}
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
          {repoLoading || setupLoading ? <LoadingBlock /> : null}
          {repoError ? (
            <ErrorBlock error={repoError} retry={reloadRepo} />
          ) : null}
          {setupError ? (
            <ErrorBlock error={setupError} retry={reloadSetup} />
          ) : null}
        </section>
      </div>
    </>
  );
}

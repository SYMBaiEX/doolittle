import {
  ArrowUpRight,
  ChevronRight,
  GitBranch,
  GitPullRequest,
  Link2,
  ListTodo,
  MessageSquare,
  Settings2,
} from "lucide-react";
import { useId } from "react";
import { CompactStatStrip } from "../components/CompactStatStrip";
import { UiIcon } from "../components/UiIcon";
import { WorkbenchSection } from "../components/workbench/Workbench";
import type {
  DashboardNextAction,
  DashboardRepoSnapshot,
  DashboardSessionCard,
  DashboardSetupEntry,
} from "../dashboard-helpers";
import { Badge, ErrorBlock, LoadingBlock } from "../lib";
import {
  DASHBOARD_SPLIT_CLASS,
  DASHBOARD_STATUS_ROW_CLASS,
} from "./dashboard-layout";

const actionIcons = {
  review: GitPullRequest,
  tasks: ListTodo,
  setup: Settings2,
  chat: MessageSquare,
  providers: Link2,
};

export function DashboardPriorityPanel({
  accountPoolLoading,
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
  accountPoolLoading: boolean;
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
  const actionLabelId = useId();
  return (
    <>
      <div className="dashboard-overview">
        <CompactStatStrip
          label="Workspace summary"
          stats={[
            {
              label: "Agent accounts",
              pending: accountPoolLoading,
              value: agentAccounts,
            },
            { label: "Conversations", value: conversations },
            { label: "Runtime plugins", value: runtimePlugins },
            {
              detail:
                repoLoading || repoError
                  ? undefined
                  : repo.dirty
                    ? `${repo.changedFiles} changed`
                    : "Clean",
              label: "Workspace branch",
              pending: repoLoading,
              tone:
                repoLoading || repoError
                  ? "neutral"
                  : repo.dirty
                    ? "warn"
                    : "good",
              value: repoError ? "Unavailable" : repo.branch,
            },
          ]}
        />
      </div>

      <div className={DASHBOARD_SPLIT_CLASS}>
        <WorkbenchSection icon={ListTodo} title="Next actions">
          <div className="dashboard-action-list">
            {nextActions.map((action, index) => {
              const handler =
                action.target === "review"
                  ? onOpenReview
                  : action.target === "tasks"
                    ? onOpenTasks
                    : action.target === "setup"
                      ? onOpenSetup
                      : action.target === "providers"
                        ? onOpenProviders
                        : onOpenChat
                          ? () => onOpenChat(sessions[0]?.id)
                          : undefined;
              return (
                <button
                  aria-label={`Open ${action.title}`}
                  aria-describedby={`${actionLabelId}-${action.id}`}
                  className="dashboard-action-row"
                  data-featured={index === 0 ? "true" : undefined}
                  disabled={!handler}
                  key={action.id}
                  onClick={handler}
                  type="button"
                >
                  <span
                    className="dashboard-action-mark"
                    data-tone={action.tone}
                  >
                    <UiIcon icon={actionIcons[action.target]} size="sm" />
                  </span>
                  <span className="dashboard-action-copy">
                    <strong>{action.title}</strong>
                    <small id={`${actionLabelId}-${action.id}`}>
                      {action.description}
                    </small>
                  </span>
                  <UiIcon icon={ArrowUpRight} size="sm" />
                </button>
              );
            })}
          </div>
        </WorkbenchSection>

        <WorkbenchSection icon={GitBranch} title="Repository and setup">
          {repoLoading ? (
            <LoadingBlock label="Reading workspace status…" />
          ) : repoError ? (
            <ErrorBlock error={repoError} retry={reloadRepo} />
          ) : (
            <div className="grid">
              <div className={DASHBOARD_STATUS_ROW_CLASS}>
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
          )}
          <details className="group mt-1.5">
            <summary className="flex min-h-8.5 cursor-pointer list-none items-center justify-between gap-2.5 rounded-[var(--radius-sm)] px-1 text-[length:var(--text-control)] hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <UiIcon
                  className="text-[var(--muted)] group-open:rotate-90"
                  icon={ChevronRight}
                  size="xs"
                />
                Workspace diagnostics
              </span>
              <Badge
                tone={
                  setupLoading || setupError
                    ? "neutral"
                    : setupWarnings
                      ? "warn"
                      : "good"
                }
              >
                {setupLoading
                  ? "Loading…"
                  : setupError
                    ? "Unavailable"
                    : setupWarnings
                      ? `${setupWarnings} warnings`
                      : "Ready"}
              </Badge>
            </summary>
            {setupLoading ? (
              <LoadingBlock label="Checking workspace readiness…" />
            ) : setupError ? (
              <ErrorBlock error={setupError} retry={reloadSetup} />
            ) : (
              <>
                <div className="grid pb-1">
                  {setupEntries.slice(0, 4).map((entry) => (
                    <div className={DASHBOARD_STATUS_ROW_CLASS} key={entry.key}>
                      <div>
                        <strong>{entry.label}</strong>
                        <small>{entry.value}</small>
                      </div>
                      <Badge tone={entry.tone}>{entry.tone}</Badge>
                    </div>
                  ))}
                </div>
                {!repoLoading && !repoError && repo.lines.length > 0 ? (
                  <div className="mt-2 grid gap-1.5 pb-1">
                    {repo.lines.slice(0, 4).map((line) => (
                      <code
                        className="block overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-soft)]"
                        key={line}
                      >
                        {line}
                      </code>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </details>
        </WorkbenchSection>
      </div>
    </>
  );
}

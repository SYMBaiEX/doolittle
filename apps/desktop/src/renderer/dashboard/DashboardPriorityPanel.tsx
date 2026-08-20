import { Button } from "@elizaos/ui/components/ui/button";
import { CompactStatStrip } from "../components/CompactStatStrip";
import type {
  DashboardNextAction,
  DashboardRepoSnapshot,
  DashboardSessionCard,
  DashboardSetupEntry,
} from "../dashboard-helpers";
import { Badge, ErrorBlock, LoadingBlock } from "../lib";
import {
  DASHBOARD_CARD_CLASS,
  DASHBOARD_CARD_HEADING_CLASS,
  DASHBOARD_STATUS_ROW_CLASS,
  DASHBOARD_TWO_COLUMN_CLASS,
} from "./dashboard-layout";

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

      <div className={DASHBOARD_TWO_COLUMN_CLASS}>
        <section className={DASHBOARD_CARD_CLASS}>
          <div className={DASHBOARD_CARD_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Next actions</span>
              <h2>What to do now</h2>
            </div>
            <Badge tone={nextActions[0]?.tone === "warn" ? "warn" : "good"}>
              {nextActions.length} queued
            </Badge>
          </div>
          <div className="grid gap-0.5">
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
                <article
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 rounded-[var(--radius-xs)] px-1 py-2.5"
                  key={action.id}
                >
                  <header className="col-start-1 flex justify-between gap-2.5">
                    <strong>{action.title}</strong>
                    <Badge tone={action.tone}>{action.target}</Badge>
                  </header>
                  <p className="col-start-1 m-0 text-[length:var(--text-body,13px)] text-[var(--text-soft)]">
                    {action.description}
                  </p>
                  <Button
                    className="col-start-2 row-span-2 row-start-1 self-center"
                    disabled={!handler}
                    onClick={() => handler?.()}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Open
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <section className={DASHBOARD_CARD_CLASS}>
          <div className={DASHBOARD_CARD_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Workspace pulse</span>
              <h2>Repository and setup</h2>
            </div>
            <Badge tone={repo.dirty || repo.behind > 0 ? "warn" : "good"}>
              {repo.dirty ? "dirty" : "stable"}
            </Badge>
          </div>
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
          <details className="group mt-[7px] rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--surface-soft)_44%,transparent)] px-1.5">
            <summary className="flex min-h-[38px] cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span>Workspace diagnostics</span>
              <Badge tone={setupWarnings ? "warn" : "good"}>
                {setupWarnings ? `${setupWarnings} warnings` : "Ready"}
              </Badge>
            </summary>
            <div className="grid gap-0.5 pb-1.5">
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
            {repo.lines.length > 0 ? (
              <div className="mt-3.5 grid gap-2">
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

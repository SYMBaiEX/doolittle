import { Button, ContextActionMenu } from "@doolittle/ui";
import { useState } from "react";
import {
  type AutomationStarterChoice,
  summarizeAutomation,
} from "../automation-model";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import { copyContextText } from "../context-menu-clipboard";
import {
  asString,
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  titleCase,
  type UnknownRecord,
} from "../lib";
import { AutomationRunHistory } from "./AutomationRunHistory";
import {
  AUTOMATION_DETAILS_SUMMARY_CLASS,
  AUTOMATION_JOB_CARD_CLASS,
  AUTOMATION_JOB_SUMMARY_CLASS,
  AUTOMATION_WORKSPACE_CLASS,
} from "./layout";

export type AutomationAction = "pause" | "resume" | "trigger" | "delete";

export function AutomationDeleteConfirmation({
  automationName,
  busy,
  onCancel,
  onConfirm,
}: {
  automationName: string;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <InlineActionConfirmation
      busy={busy}
      busyLabel="Deleting…"
      confirmLabel="Confirm delete"
      detail="This removes its configuration and stops future triggers."
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={`Delete ${automationName}?`}
    />
  );
}

function AutomationJobCard({
  entry,
  index,
  busy,
  onAction,
  onFeedback,
  botNames,
}: {
  entry: UnknownRecord;
  index: number;
  busy: string;
  onAction(id: string, action: AutomationAction): Promise<boolean>;
  onFeedback(message: string): void;
  botNames: Readonly<Record<string, string>>;
}) {
  const id = asString(entry.id, String(index));
  const status = asString(entry.status, "active");
  const summary = summarizeAutomation(entry);
  const name = asString(entry.name, `Automation ${index + 1}`);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleting = busy === `${id}:delete`;
  const copyWebhookPath = async () => {
    if (!summary.webhookPath) return;
    try {
      await navigator.clipboard.writeText(summary.webhookPath);
      onFeedback("Webhook path copied.");
    } catch {
      onFeedback(`Webhook path: ${summary.webhookPath}`);
    }
  };
  const deleteAutomation = async () => {
    if (await onAction(id, "delete")) setConfirmDelete(false);
  };

  return (
    <ContextActionMenu
      label={`${name} actions`}
      scopeKey={`automation:${id}:${status}:${confirmDelete}`}
      items={[
        {
          id: "trigger",
          label: "Run now",
          disabled: Boolean(busy) || status === "paused" || confirmDelete,
          onSelect: () => void onAction(id, "trigger"),
        },
        {
          id: "pause-resume",
          label: status === "paused" ? "Resume" : "Pause",
          disabled: Boolean(busy) || confirmDelete,
          onSelect: () =>
            void onAction(id, status === "paused" ? "resume" : "pause"),
        },
        {
          id: "copy-id",
          label: "Copy automation ID",
          onSelect: () => void copyContextText(id),
        },
        {
          id: "delete",
          label: "Delete…",
          destructive: true,
          separatorBefore: true,
          disabled: Boolean(busy) || confirmDelete,
          onSelect: () => setConfirmDelete(true),
        },
      ]}
    >
      <article className={AUTOMATION_JOB_CARD_CLASS}>
        <header className="flex items-center justify-between gap-2.5">
          <div className="automation-job-card__heading flex min-w-0 flex-col gap-1">
            <strong className="truncate text-sm">{name}</strong>
            <span className="text-sm text-[var(--muted)]">
              Runs as{" "}
              {asString(entry.targetBotId) &&
              asString(entry.targetBotId) !== "default"
                ? (botNames[asString(entry.targetBotId)] ??
                  "Unavailable bot (no fallback)")
                : "Doolittle"}
            </span>
            <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
              {displayTimestamp(asString(entry.nextRunAt) || undefined)}
            </small>
          </div>
          <Badge tone={status === "paused" ? "warn" : "good"}>
            {titleCase(status)}
          </Badge>
        </header>
        <dl className={AUTOMATION_JOB_SUMMARY_CLASS}>
          {[
            ["Trigger", summary.triggerLabel],
            ["Condition", summary.conditionLabel],
            ["Action", summary.actionLabel],
          ].map(([label, value]) => (
            <div className="grid min-w-0 gap-1" key={label}>
              <dt className="text-xs font-medium text-[var(--muted)]">
                {label}
              </dt>
              <dd className="m-0 break-words text-sm text-[var(--text-soft)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <details className="automation-job-details my-2">
          <summary className={AUTOMATION_DETAILS_SUMMARY_CLASS}>
            Details
          </summary>
          {summary.webhookPath ? (
            <button
              className="automation-webhook-path mt-2 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_35%,transparent)] px-2.25 py-1.75 text-left text-[var(--muted)]"
              onClick={() => void copyWebhookPath()}
              title="Copy local webhook path"
              type="button"
            >
              <span className="automation-webhook-path__label text-[length:var(--text-meta)] font-extrabold tracking-[0.06em] text-[var(--accent)] uppercase">
                Webhook
              </span>
              <code className="truncate text-[length:var(--text-meta)] text-[var(--text-soft)]">
                {summary.webhookPath}
              </code>
              <small className="automation-webhook-path__action text-[length:var(--text-meta)] font-extrabold tracking-[0.06em] text-[var(--accent)] uppercase">
                Copy
              </small>
            </button>
          ) : null}
          <p className="mt-0.5 mb-2 text-xs leading-[1.5] text-[var(--text-soft)]">
            {asString(entry.prompt, "No prompt configured.")}
          </p>
        </details>
        {confirmDelete ? (
          <AutomationDeleteConfirmation
            automationName={name}
            busy={deleting}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => void deleteAutomation()}
          />
        ) : (
          <footer className="flex items-center gap-2.5 max-[620px]:items-stretch max-[620px]:flex-col">
            <Button
              disabled={Boolean(busy) || status === "paused"}
              onClick={() => void onAction(id, "trigger")}
              type="button"
              variant="secondary"
            >
              {busy === `${id}:trigger` ? "Running…" : "Run now"}
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() =>
                void onAction(id, status === "paused" ? "resume" : "pause")
              }
              type="button"
              variant="secondary"
            >
              {status === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => setConfirmDelete(true)}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </footer>
        )}
      </article>
    </ContextActionMenu>
  );
}

export function AutomationWorkspace({
  builderOpen,
  busy,
  jobs,
  jobsError,
  jobsLoading,
  onAction,
  onCreate,
  onFeedback,
  onReloadJobs,
  onReloadRuns,
  onRunsOpenChange,
  onSelectRun,
  runs,
  runsError,
  runsLoading,
  runsOpen,
  selectedRun,
  botNames = {},
}: {
  builderOpen: boolean;
  busy: string;
  jobs: UnknownRecord[];
  jobsError: string | null;
  jobsLoading: boolean;
  onAction(id: string, action: AutomationAction): Promise<boolean>;
  onCreate(starter: AutomationStarterChoice): void;
  onFeedback(message: string): void;
  onReloadJobs(): void;
  onReloadRuns(): void;
  onRunsOpenChange(open: boolean): void;
  onSelectRun(id: string): void;
  runs: UnknownRecord[];
  runsError: string | null;
  runsLoading: boolean;
  runsOpen: boolean;
  selectedRun?: UnknownRecord;
  botNames?: Readonly<Record<string, string>>;
}) {
  return (
    <div
      className={`${AUTOMATION_WORKSPACE_CLASS}${jobs.length ? "" : " is-empty max-w-225 grid-cols-1"}`}
    >
      {jobsLoading || jobsError || jobs.length ? (
        <section className="content-card automation-jobs-panel min-w-0">
          <div className="card-heading">
            <div>
              <h3>Schedules</h3>
            </div>
            <Badge>{jobs.length}</Badge>
          </div>
          {jobsLoading ? (
            <LoadingBlock label="Loading automations…" />
          ) : jobsError ? (
            <ErrorBlock error={jobsError} retry={onReloadJobs} />
          ) : (
            <div className="automation-job-list flex flex-col gap-2.5">
              {jobs.map((entry, index) => (
                <AutomationJobCard
                  botNames={botNames}
                  busy={busy}
                  entry={entry}
                  index={index}
                  key={asString(entry.id, String(index))}
                  onAction={onAction}
                  onFeedback={onFeedback}
                />
              ))}
            </div>
          )}
        </section>
      ) : builderOpen ? null : (
        <section aria-labelledby="automation-starter-title" className="min-w-0">
          <h3
            className="mb-3 text-sm font-medium text-[var(--muted)]"
            id="automation-starter-title"
          >
            No automations yet
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={() => onCreate("weekday-brief")}
              type="button"
              variant="secondary"
            >
              Weekday brief
            </Button>
            <Button
              onClick={() => onCreate("webhook-triage")}
              type="button"
              variant="secondary"
            >
              Webhook triage
            </Button>
          </div>
        </section>
      )}

      <AutomationRunHistory
        onOpenChange={onRunsOpenChange}
        onReload={onReloadRuns}
        onSelectRun={onSelectRun}
        open={runsOpen}
        quiet={jobs.length === 0}
        runs={runs}
        runsError={runsError}
        runsLoading={runsLoading}
        selectedRun={selectedRun}
      />
    </div>
  );
}

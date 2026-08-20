import { Button } from "@elizaos/ui/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  type AutomationStarterChoice,
  summarizeAutomation,
} from "../automation-model";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import { UiIcon } from "../components/UiIcon";
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
}: {
  entry: UnknownRecord;
  index: number;
  busy: string;
  onAction(id: string, action: AutomationAction): Promise<boolean>;
  onFeedback(message: string): void;
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
    <article className={AUTOMATION_JOB_CARD_CLASS}>
      <header className="flex items-center justify-between gap-2.5">
        <div className="automation-job-card__heading flex min-w-0 flex-col gap-1">
          <strong className="truncate text-xs">{name}</strong>
          <small className="text-[10px] text-[var(--muted)]">
            {displayTimestamp(asString(entry.nextRunAt) || undefined)}
          </small>
        </div>
        <Badge tone={status === "paused" ? "warn" : "good"}>
          {titleCase(status)}
        </Badge>
      </header>
      <div className={AUTOMATION_JOB_SUMMARY_CLASS}>
        <span className="automation-job-summary__segment inline-flex min-w-0 items-center gap-1.5 max-[620px]:justify-between">
          <i className="font-[var(--font-mono)] text-[10px] not-italic text-[var(--accent)] uppercase">
            Trigger
          </i>
          <span className="truncate text-[11px] text-[var(--text-soft)]">
            {summary.triggerLabel}
          </span>
        </span>
        <UiIcon
          className="mx-auto text-[var(--accent)] opacity-60 max-[620px]:hidden"
          icon={ChevronRight}
          size="xs"
        />
        <span className="automation-job-summary__segment inline-flex min-w-0 items-center gap-1.5 max-[620px]:justify-between">
          <i className="font-[var(--font-mono)] text-[10px] not-italic text-[var(--accent)] uppercase">
            Condition
          </i>
          <span className="truncate text-[11px] text-[var(--text-soft)]">
            {summary.conditionLabel}
          </span>
        </span>
        <UiIcon
          className="mx-auto text-[var(--accent)] opacity-60 max-[620px]:hidden"
          icon={ChevronRight}
          size="xs"
        />
        <span className="automation-job-summary__segment inline-flex min-w-0 items-center gap-1.5 max-[620px]:justify-between">
          <i className="font-[var(--font-mono)] text-[10px] not-italic text-[var(--accent)] uppercase">
            Action
          </i>
          <span className="truncate text-[11px] text-[var(--text-soft)]">
            {summary.actionLabel}
          </span>
        </span>
      </div>
      <details className="automation-job-details my-2">
        <summary className={AUTOMATION_DETAILS_SUMMARY_CLASS}>Details</summary>
        {summary.webhookPath ? (
          <button
            className="automation-webhook-path mt-2 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_35%,transparent)] px-2.25 py-1.75 text-left text-[var(--muted)]"
            onClick={() => void copyWebhookPath()}
            title="Copy local webhook path"
            type="button"
          >
            <span className="automation-webhook-path__label text-[10px] font-extrabold tracking-[0.06em] text-[var(--accent)] uppercase">
              Webhook
            </span>
            <code className="truncate text-[10px] text-[var(--text-soft)]">
              {summary.webhookPath}
            </code>
            <small className="automation-webhook-path__action text-[10px] font-extrabold tracking-[0.06em] text-[var(--accent)] uppercase">
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
            Run now
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
}) {
  return (
    <div
      className={`${AUTOMATION_WORKSPACE_CLASS}${jobs.length ? "" : " is-empty max-w-225 grid-cols-1"}`}
    >
      {jobsLoading || jobsError || jobs.length ? (
        <section className="content-card automation-jobs-panel min-w-0">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Workflows</span>
              <h2>Automations</h2>
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
        <section
          aria-labelledby="automation-starter-title"
          className="content-card automation-empty-panel"
        >
          <div className="automation-empty-starter flex items-center justify-between gap-4 px-0.5 py-0.75 text-[var(--muted)] max-[720px]:items-stretch max-[720px]:flex-col">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="eyebrow">Start here</span>
              <strong
                className="text-[13px] text-[var(--text-strong)]"
                id="automation-starter-title"
              >
                Build your first workflow
              </strong>
              <p className="m-0 text-[10px] leading-[1.45]">
                Start blank or adapt a practical local preset.
              </p>
            </div>
            <Button onClick={() => onCreate("blank")} type="button">
              Blank workflow
            </Button>
          </div>
          <fieldset className="automation-starters mt-2.5 grid min-w-0 grid-cols-2 gap-1.25 border-0 p-0 max-[720px]:grid-cols-1">
            <legend className="sr-only">Automation starters</legend>
            <button
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] px-2 py-2.5 text-left text-[var(--text-soft)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface-soft))] [&>span:first-child]:font-[var(--font-mono)] [&>span:first-child]:text-[10px] [&>span:first-child]:text-[var(--accent)] [&>span:nth-child(2)]:flex [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:flex-col [&>span:nth-child(2)]:gap-0.5 [&_strong]:truncate [&_strong]:text-xs [&_small]:truncate [&_small]:text-[10px] [&_small]:text-[var(--muted)] [&>i]:font-[var(--font-mono)] [&>i]:text-[10px] [&>i]:not-italic [&>i]:text-[var(--accent)]"
              onClick={() => onCreate("weekday-brief")}
              type="button"
            >
              <span aria-hidden="true">01</span>
              <span>
                <strong>Weekday brief</strong>
                <small>9 AM weekdays → run agent</small>
              </span>
              <i>Use starter</i>
            </button>
            <button
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] px-2 py-2.5 text-left text-[var(--text-soft)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface-soft))] [&>span:first-child]:font-[var(--font-mono)] [&>span:first-child]:text-[10px] [&>span:first-child]:text-[var(--accent)] [&>span:nth-child(2)]:flex [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:flex-col [&>span:nth-child(2)]:gap-0.5 [&_strong]:truncate [&_strong]:text-xs [&_small]:truncate [&_small]:text-[10px] [&_small]:text-[var(--muted)] [&>i]:font-[var(--font-mono)] [&>i]:text-[10px] [&>i]:not-italic [&>i]:text-[var(--accent)]"
              onClick={() => onCreate("webhook-triage")}
              type="button"
            >
              <span aria-hidden="true">02</span>
              <span>
                <strong>Webhook triage</strong>
                <small>Local webhook → run agent</small>
              </span>
              <i>Use starter</i>
            </button>
          </fieldset>
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

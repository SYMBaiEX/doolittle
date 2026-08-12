import { useState } from "react";
import {
  type AutomationStarterChoice,
  summarizeAutomation,
} from "../automation-model";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
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
    <article className="automation-job-card">
      <header>
        <div className="automation-job-card__heading">
          <strong>{name}</strong>
          <small>
            {displayTimestamp(asString(entry.nextRunAt) || undefined)}
          </small>
        </div>
        <Badge tone={status === "paused" ? "warn" : "good"}>
          {titleCase(status)}
        </Badge>
      </header>
      <div className="automation-job-summary">
        <span className="automation-job-summary__segment">
          <i>Trigger</i>
          <span>{summary.triggerLabel}</span>
        </span>
        <b aria-hidden="true">›</b>
        <span className="automation-job-summary__segment">
          <i>Condition</i>
          <span>{summary.conditionLabel}</span>
        </span>
        <b aria-hidden="true">›</b>
        <span className="automation-job-summary__segment">
          <i>Action</i>
          <span>{summary.actionLabel}</span>
        </span>
      </div>
      <details className="automation-job-details">
        <summary>Details</summary>
        {summary.webhookPath ? (
          <button
            className="automation-webhook-path"
            onClick={() => void copyWebhookPath()}
            title="Copy local webhook path"
            type="button"
          >
            <span className="automation-webhook-path__label">Webhook</span>
            <code>{summary.webhookPath}</code>
            <small className="automation-webhook-path__action">Copy</small>
          </button>
        ) : null}
        <p>{asString(entry.prompt, "No prompt configured.")}</p>
      </details>
      {confirmDelete ? (
        <AutomationDeleteConfirmation
          automationName={name}
          busy={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void deleteAutomation()}
        />
      ) : (
        <footer>
          <button
            className="secondary-button"
            disabled={Boolean(busy) || status === "paused"}
            onClick={() => void onAction(id, "trigger")}
            type="button"
          >
            Run now
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(busy)}
            onClick={() =>
              void onAction(id, status === "paused" ? "resume" : "pause")
            }
            type="button"
          >
            {status === "paused" ? "Resume" : "Pause"}
          </button>
          <button
            className="danger-button"
            disabled={Boolean(busy)}
            onClick={() => setConfirmDelete(true)}
            type="button"
          >
            Delete
          </button>
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
    <div className={`automation-workspace${jobs.length ? "" : " is-empty"}`}>
      {jobsLoading || jobsError || jobs.length ? (
        <section className="content-card automation-jobs-panel">
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
            <div className="automation-job-list">
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
          <div className="automation-empty-starter">
            <div>
              <span className="eyebrow">Start here</span>
              <strong id="automation-starter-title">
                Build your first workflow
              </strong>
              <p>Start blank or adapt a practical local preset.</p>
            </div>
            <button
              className="primary-button"
              onClick={() => onCreate("blank")}
              type="button"
            >
              Blank workflow
            </button>
          </div>
          <fieldset className="automation-starters">
            <legend className="sr-only">Automation starters</legend>
            <button onClick={() => onCreate("weekday-brief")} type="button">
              <span aria-hidden="true">01</span>
              <span>
                <strong>Weekday brief</strong>
                <small>9 AM weekdays → run agent</small>
              </span>
              <i>Use starter</i>
            </button>
            <button onClick={() => onCreate("webhook-triage")} type="button">
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

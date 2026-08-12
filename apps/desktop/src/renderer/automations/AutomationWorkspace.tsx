import { useMemo, useState } from "react";
import { summarizeAutomation } from "../automation-model";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  titleCase,
  type UnknownRecord,
} from "../lib";

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

function runTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "failed") return "bad";
  if (status === "skipped") return "warn";
  if (status === "completed") return "good";
  return "neutral";
}

function AutomationTrace({ entry }: { entry: UnknownRecord }) {
  const status = asString(entry.status, "completed");
  const trace = useMemo(
    () => asArray(entry.trace).map(asRecord),
    [entry.trace],
  );
  return (
    <div className="automation-trace">
      <header>
        <div>
          <span className="eyebrow">Selected receipt</span>
          <strong>{asString(entry.jobName, "Automation run")}</strong>
        </div>
        <Badge tone={runTone(status)}>{titleCase(status)}</Badge>
      </header>
      <div className="automation-trace-steps">
        {trace.length ? (
          trace.map((step, index) => {
            const stepStatus = asString(step.status, "completed");
            return (
              <div
                className="automation-trace-step"
                key={asString(step.id, String(index))}
              >
                <span className={`automation-run-status ${stepStatus}`} />
                <div className="automation-trace-step__content">
                  <strong className="automation-trace-step__title">
                    {titleCase(asString(step.phase, "step"))}
                  </strong>
                  <p>{asString(step.message, titleCase(stepStatus))}</p>
                </div>
                <small className="automation-trace-step__index">
                  {String(index + 1).padStart(2, "0")}
                </small>
              </div>
            );
          })
        ) : (
          <div className="automation-trace-step">
            <span className={`automation-run-status ${status}`} />
            <div className="automation-trace-step__content">
              <strong className="automation-trace-step__title">
                Legacy receipt
              </strong>
              <p>This run predates phase-level trace capture.</p>
            </div>
          </div>
        )}
      </div>
      <details className="automation-trace-output">
        <summary>Output</summary>
        <pre>{asString(entry.output, "No output was recorded.")}</pre>
      </details>
    </div>
  );
}

export function AutomationWorkspace({
  busy,
  jobs,
  jobsError,
  jobsLoading,
  onAction,
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
  busy: string;
  jobs: UnknownRecord[];
  jobsError: string | null;
  jobsLoading: boolean;
  onAction(id: string, action: AutomationAction): Promise<boolean>;
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
    <div className="automation-workspace">
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
        ) : jobs.length ? (
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
        ) : (
          <EmptyBlock density="compact" title="No automations yet">
            Build a trigger, condition, and action to give Doolittle reliable
            background work.
          </EmptyBlock>
        )}
      </section>

      <details
        className="content-card automation-runs-panel"
        onToggle={(event) => onRunsOpenChange(event.currentTarget.open)}
        open={runsOpen}
      >
        <summary>
          <span>
            <strong>Trace receipts</strong>
            <small>Execution history and phase-level output</small>
          </span>
          <span className="automation-runs-panel__meta">
            {runsOpen ? `${runs.length} loaded` : "Open to load"}
          </span>
        </summary>
        {runsOpen ? (
          <div className="automation-runs-body">
            <div className="automation-runs-toolbar">
              <span>Latest durable execution receipts</span>
              <button
                className="text-button"
                onClick={onReloadRuns}
                type="button"
              >
                Refresh
              </button>
            </div>
            {runsLoading ? (
              <LoadingBlock label="Loading traces…" />
            ) : runsError ? (
              <ErrorBlock error={runsError} retry={onReloadRuns} />
            ) : runs.length ? (
              <div className="automation-trace-layout">
                <ul
                  aria-label="Automation runs"
                  className="automation-run-list"
                >
                  {runs.map((entry, index) => {
                    const id = asString(entry.id, String(index));
                    const status = asString(entry.status, "completed");
                    return (
                      <li key={id}>
                        <button
                          aria-pressed={asString(selectedRun?.id) === id}
                          className={
                            asString(selectedRun?.id) === id ? "selected" : ""
                          }
                          onClick={() => onSelectRun(id)}
                          type="button"
                        >
                          <span className={`automation-run-status ${status}`} />
                          <span>
                            <strong className="automation-run-list__title">
                              {asString(entry.jobName, "Automation run")}
                            </strong>
                            <small className="automation-run-list__meta">
                              {titleCase(
                                asString(entry.triggerType, "schedule"),
                              )}{" "}
                              ·{" "}
                              {displayTimestamp(
                                asString(
                                  entry.completedAt,
                                  asString(entry.createdAt),
                                ) || undefined,
                              )}
                            </small>
                          </span>
                          <Badge tone={runTone(status)}>
                            {titleCase(status)}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {selectedRun ? <AutomationTrace entry={selectedRun} /> : null}
              </div>
            ) : (
              <EmptyBlock density="compact" title="No trace receipts">
                Run an automation to inspect its trigger, condition, action, and
                delivery phases.
              </EmptyBlock>
            )}
          </div>
        ) : null}
      </details>
    </div>
  );
}

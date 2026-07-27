import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type AutomationActionChoice,
  type AutomationConditionChoice,
  type AutomationDraft,
  type AutomationTriggerChoice,
  buildAutomationRequest,
  summarizeAutomation,
} from "./automation-model";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import "./automations.css";

interface CronResponse {
  jobs?: unknown[];
  runs?: unknown[];
}

const initialDraft = (): AutomationDraft => ({
  name: "",
  triggerType: "schedule",
  schedule: "0 9 * * 1-5",
  conditionType: "always",
  conditionPath: "",
  conditionValue: "",
  actionType: "run-agent",
  prompt: "",
  webhookUrl: "",
});

export function AutomationsPage({ active }: { active: boolean }) {
  const jobs = useApiResource<CronResponse>(active ? "/cron/jobs" : null, [
    active,
  ]);
  const runs = useApiResource<CronResponse>(active ? "/cron/runs" : null, [
    active,
  ]);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AutomationDraft>(initialDraft);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "good" | "bad" | "neutral";
  } | null>(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const entries = asArray(jobs.data?.jobs).map(asRecord);
  const runEntries = asArray(runs.data?.runs).map(asRecord);
  const selectedRun =
    runEntries.find((entry) => asString(entry.id) === selectedRunId) ??
    runEntries[0];
  const activeJobs = entries.filter(
    (entry) => asString(entry.status, "active") === "active",
  ).length;
  const failedRuns = runEntries.filter(
    (entry) => asString(entry.status, "completed") === "failed",
  ).length;
  const webhookJobs = entries.filter(
    (entry) => summarizeAutomation(entry).triggerType === "webhook",
  ).length;

  useEffect(() => {
    if (
      selectedRunId &&
      !runEntries.some((entry) => asString(entry.id) === selectedRunId)
    ) {
      setSelectedRunId("");
    }
  }, [runEntries, selectedRunId]);

  const updateDraft = <Key extends keyof AutomationDraft>(
    key: Key,
    value: AutomationDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const request = buildAutomationRequest(draft);
    if (!request.ok) {
      setFeedback({ message: request.error, tone: "bad" });
      return;
    }
    setBusy("create");
    setFeedback(null);
    try {
      await desktopRequest("/cron/jobs", "POST", request.payload);
      setDraft(initialDraft());
      setShowCreate(false);
      setFeedback({ message: "Automation created.", tone: "good" });
      jobs.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const act = async (
    id: string,
    action: "pause" | "resume" | "trigger" | "delete",
  ) => {
    setBusy(`${id}:${action}`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/cron/jobs/${encodeURIComponent(id)}${action === "delete" ? "" : `/${action}`}`,
        action === "delete" ? "DELETE" : "POST",
        action === "trigger" ? {} : undefined,
      );
      setFeedback({
        message:
          action === "delete"
            ? "Automation deleted."
            : action === "trigger"
              ? "Automation completed. The trace is ready."
              : `Automation ${action === "pause" ? "paused" : "resumed"}.`,
        tone: "good",
      });
      jobs.reload();
      runs.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page automation-page">
      <PageHeader
        eyebrow="Operations"
        title="Automations"
        description="Compose reliable agent workflows with explicit triggers, conditions, actions, and inspectable execution traces."
        actions={
          <button
            className={showCreate ? "secondary-button" : "primary-button"}
            onClick={() => setShowCreate((value) => !value)}
            type="button"
          >
            {showCreate ? "Close builder" : "New automation"}
          </button>
        }
      />

      <div className="metric-grid compact automation-metrics">
        <MetricCard
          label="Active"
          value={activeJobs}
          detail={`${entries.length} configured`}
        />
        <MetricCard
          label="Webhook inputs"
          value={webhookJobs}
          detail="Local capability URLs"
        />
        <MetricCard
          label="Recent runs"
          value={runEntries.length}
          detail="Durable trace receipts"
        />
        <MetricCard
          label="Failures"
          value={failedRuns}
          detail={failedRuns ? "Needs attention" : "All clear"}
        />
      </div>

      {showCreate ? (
        <form className="automation-builder" onSubmit={create}>
          <div className="automation-builder__header">
            <div>
              <span className="eyebrow">Workflow builder</span>
              <h2>When this happens, decide, then act</h2>
            </div>
            <label className="automation-name-field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="Release readiness"
              />
            </label>
          </div>

          <div className="automation-builder__flow">
            <AutomationBuilderStep
              index="01"
              label="Trigger"
              description="Starts the workflow"
            >
              <ChoiceButtons
                choices={[
                  ["schedule", "Schedule"],
                  ["manual", "Manual"],
                  ["webhook", "Webhook"],
                ]}
                selected={draft.triggerType}
                onSelect={(value) =>
                  updateDraft("triggerType", value as AutomationTriggerChoice)
                }
              />
              {draft.triggerType === "schedule" ? (
                <label>
                  <span>Schedule</span>
                  <input
                    required
                    value={draft.schedule}
                    onChange={(event) =>
                      updateDraft("schedule", event.target.value)
                    }
                    placeholder="0 9 * * 1-5 or every 2h"
                  />
                  <small>5-field cron or an interval such as every 30m.</small>
                </label>
              ) : (
                <div className="automation-builder__truth">
                  {draft.triggerType === "manual"
                    ? "Runs only when you press Run now."
                    : "A private local webhook path is generated after save."}
                </div>
              )}
            </AutomationBuilderStep>

            <span className="automation-flow-arrow" aria-hidden="true">
              →
            </span>

            <AutomationBuilderStep
              index="02"
              label="Condition"
              description="Guards the action"
            >
              <label>
                <span>Continue when</span>
                <select
                  value={draft.conditionType}
                  onChange={(event) =>
                    updateDraft(
                      "conditionType",
                      event.target.value as AutomationConditionChoice,
                    )
                  }
                >
                  <option value="always">Always</option>
                  <option value="exists">Payload field exists</option>
                  <option value="equals">Payload field equals</option>
                  <option value="contains">Payload field contains</option>
                </select>
              </label>
              {draft.conditionType !== "always" ? (
                <>
                  <label>
                    <span>Payload field</span>
                    <input
                      value={draft.conditionPath}
                      onChange={(event) =>
                        updateDraft("conditionPath", event.target.value)
                      }
                      placeholder="event.status"
                    />
                  </label>
                  {draft.conditionType !== "exists" ? (
                    <label>
                      <span>Value</span>
                      <input
                        value={draft.conditionValue}
                        onChange={(event) =>
                          updateDraft("conditionValue", event.target.value)
                        }
                        placeholder="ready"
                      />
                    </label>
                  ) : null}
                </>
              ) : (
                <div className="automation-builder__truth">
                  Every accepted trigger continues to the action.
                </div>
              )}
            </AutomationBuilderStep>

            <span className="automation-flow-arrow" aria-hidden="true">
              →
            </span>

            <AutomationBuilderStep
              index="03"
              label="Action"
              description="Performs the work"
            >
              <ChoiceButtons
                choices={[
                  ["run-agent", "Run agent"],
                  ["prompt", "Prompt"],
                  ["webhook", "Webhook"],
                ]}
                selected={draft.actionType}
                onSelect={(value) =>
                  updateDraft("actionType", value as AutomationActionChoice)
                }
              />
              {draft.actionType === "webhook" ? (
                <label>
                  <span>Destination URL</span>
                  <input
                    type="url"
                    value={draft.webhookUrl}
                    onChange={(event) =>
                      updateDraft("webhookUrl", event.target.value)
                    }
                    placeholder="https://example.com/hooks/doolittle"
                  />
                  <small>
                    Sends a JSON POST without stored authorization headers.
                  </small>
                </label>
              ) : (
                <label>
                  <span>Prompt</span>
                  <textarea
                    rows={5}
                    value={draft.prompt}
                    onChange={(event) =>
                      updateDraft("prompt", event.target.value)
                    }
                    placeholder="Review the latest work and produce an operator-ready receipt."
                  />
                </label>
              )}
            </AutomationBuilderStep>
          </div>

          <div className="automation-builder__footer">
            <span>
              Output and each phase result are stored in the local trace
              archive.
            </span>
            <button
              className="primary-button"
              disabled={busy === "create"}
              type="submit"
            >
              {busy === "create" ? "Creating…" : "Create automation"}
            </button>
          </div>
        </form>
      ) : null}

      {feedback ? (
        <Notice announce="status" tone={feedback.tone}>
          {feedback.message}
        </Notice>
      ) : null}

      <div className="automation-workspace">
        <section className="content-card automation-jobs-panel">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Workflows</span>
              <h2>Automations</h2>
            </div>
            <Badge>{entries.length}</Badge>
          </div>
          {jobs.loading ? (
            <LoadingBlock label="Loading automations…" />
          ) : jobs.error ? (
            <ErrorBlock error={jobs.error} retry={jobs.reload} />
          ) : entries.length ? (
            <div className="automation-job-list">
              {entries.map((entry, index) => (
                <AutomationJobCard
                  busy={busy}
                  entry={entry}
                  index={index}
                  key={asString(entry.id, String(index))}
                  onAction={act}
                  onFeedback={(message) =>
                    setFeedback({ message, tone: "good" })
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyBlock title="No automations yet">
              Build a trigger, condition, and action to give Doolittle reliable
              background work.
            </EmptyBlock>
          )}
        </section>

        <section className="content-card automation-runs-panel">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Execution</span>
              <h2>Trace receipts</h2>
            </div>
            <button className="text-button" onClick={runs.reload} type="button">
              Refresh
            </button>
          </div>
          {runs.loading ? (
            <LoadingBlock label="Loading traces…" />
          ) : runs.error ? (
            <ErrorBlock error={runs.error} retry={runs.reload} />
          ) : runEntries.length ? (
            <div className="automation-trace-layout">
              <ul aria-label="Automation runs" className="automation-run-list">
                {runEntries.map((entry, index) => {
                  const id = asString(entry.id, String(index));
                  const status = asString(entry.status, "completed");
                  return (
                    <li key={id}>
                      <button
                        aria-pressed={asString(selectedRun?.id) === id}
                        className={
                          asString(selectedRun?.id) === id ? "selected" : ""
                        }
                        onClick={() => setSelectedRunId(id)}
                        type="button"
                      >
                        <span className={`automation-run-status ${status}`} />
                        <span>
                          <strong className="automation-run-list__title">
                            {asString(entry.jobName, "Automation run")}
                          </strong>
                          <small className="automation-run-list__meta">
                            {titleCase(asString(entry.triggerType, "schedule"))}{" "}
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
            <EmptyBlock title="No trace receipts">
              Run an automation to inspect its trigger, condition, action, and
              delivery phases.
            </EmptyBlock>
          )}
        </section>
      </div>
    </div>
  );
}

function AutomationBuilderStep({
  index,
  label,
  description,
  children,
}: {
  index: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="automation-builder-step">
      <header>
        <span>{index}</span>
        <div>
          <strong>{label}</strong>
          <small>{description}</small>
        </div>
      </header>
      <div className="automation-builder-step__body">{children}</div>
    </section>
  );
}

function ChoiceButtons({
  choices,
  selected,
  onSelect,
}: {
  choices: Array<[string, string]>;
  selected: string;
  onSelect(value: string): void;
}) {
  return (
    <div className="automation-choice-grid">
      {choices.map(([value, label]) => (
        <button
          aria-pressed={selected === value}
          className={selected === value ? "selected" : ""}
          key={value}
          onClick={() => onSelect(value)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
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
  onAction(
    id: string,
    action: "pause" | "resume" | "trigger" | "delete",
  ): Promise<void>;
  onFeedback(message: string): void;
}) {
  const id = asString(entry.id, String(index));
  const status = asString(entry.status, "active");
  const summary = summarizeAutomation(entry);
  const copyWebhookPath = async () => {
    if (!summary.webhookPath) return;
    try {
      await navigator.clipboard.writeText(summary.webhookPath);
      onFeedback("Webhook path copied.");
    } catch {
      onFeedback(`Webhook path: ${summary.webhookPath}`);
    }
  };

  return (
    <article className="automation-job-card">
      <header>
        <div>
          <strong>{asString(entry.name, `Automation ${index + 1}`)}</strong>
          <small>
            Next: {displayTimestamp(asString(entry.nextRunAt) || undefined)}
          </small>
        </div>
        <Badge tone={status === "paused" ? "warn" : "good"}>
          {titleCase(status)}
        </Badge>
      </header>
      <div className="automation-job-flow">
        <span>
          <i>Trigger</i>
          {summary.triggerLabel}
        </span>
        <b aria-hidden="true">›</b>
        <span>
          <i>Condition</i>
          {summary.conditionLabel}
        </span>
        <b aria-hidden="true">›</b>
        <span>
          <i>Action</i>
          {summary.actionLabel}
        </span>
      </div>
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
          onClick={() => void onAction(id, "delete")}
          type="button"
        >
          Delete
        </button>
      </footer>
    </article>
  );
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
      <div className="automation-trace-output">
        <span>Output</span>
        <pre>{asString(entry.output, "No output was recorded.")}</pre>
      </div>
    </div>
  );
}

function runTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "failed") return "bad";
  if (status === "skipped") return "warn";
  if (status === "completed") return "good";
  return "neutral";
}

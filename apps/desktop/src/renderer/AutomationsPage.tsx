import { type FormEvent, useEffect, useState } from "react";
import {
  type AutomationDraft,
  buildAutomationRequest,
  summarizeAutomation,
} from "./automation-model";
import { AutomationBuilder } from "./automations/AutomationBuilder";
import {
  type AutomationAction,
  AutomationWorkspace,
} from "./automations/AutomationWorkspace";

export { AutomationDeleteConfirmation } from "./automations/AutomationWorkspace";

import { CompactStatStrip } from "./components/CompactStatStrip";
import {
  type ActionFeedback,
  asArray,
  asRecord,
  asString,
  desktopRequest,
  errorMessage,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";
import "./automations.css";
import { automationRequests } from "./resource-request-policy";

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
  const [runsOpen, setRunsOpen] = useState(false);
  const resourcePolicy = automationRequests({ active, runsOpen });
  const jobs = useApiResource<CronResponse>(
    resourcePolicy.jobs ? "/cron/jobs" : null,
    [resourcePolicy.jobs],
  );
  const runs = useApiResource<CronResponse>(
    resourcePolicy.runs ? "/cron/runs" : null,
    [resourcePolicy.runs],
  );
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AutomationDraft>(initialDraft);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
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

  const act = async (id: string, action: AutomationAction) => {
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
      return true;
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
      return false;
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

      <CompactStatStrip
        label="Automation summary"
        stats={[
          {
            detail: `${entries.length} configured`,
            label: "Active",
            tone: activeJobs ? "good" : "neutral",
            value: activeJobs,
          },
          {
            detail: "Local capability URLs",
            label: "Webhook inputs",
            value: webhookJobs,
          },
          {
            detail: runsOpen ? "Durable trace receipts" : "Open to load",
            label: "Recent runs",
            value: runsOpen ? runEntries.length : "—",
          },
          {
            detail: runsOpen
              ? failedRuns
                ? "Needs attention"
                : "All clear"
              : "Trace drawer closed",
            label: "Failures",
            tone: runsOpen && failedRuns ? "bad" : "neutral",
            value: runsOpen ? failedRuns : "—",
          },
        ]}
      />

      {showCreate ? (
        <AutomationBuilder
          busy={busy === "create"}
          draft={draft}
          onSubmit={create}
          onUpdate={updateDraft}
        />
      ) : null}

      {feedback ? (
        <Notice announce="status" tone={feedback.tone}>
          {feedback.message}
        </Notice>
      ) : null}

      <AutomationWorkspace
        busy={busy}
        jobs={entries}
        jobsError={jobs.error}
        jobsLoading={jobs.loading}
        onAction={act}
        onFeedback={(message) => setFeedback({ message, tone: "good" })}
        onReloadJobs={jobs.reload}
        onReloadRuns={runs.reload}
        onRunsOpenChange={setRunsOpen}
        onSelectRun={setSelectedRunId}
        runs={runEntries}
        runsError={runs.error}
        runsLoading={runs.loading}
        runsOpen={runsOpen}
        selectedRun={selectedRun}
      />
    </div>
  );
}

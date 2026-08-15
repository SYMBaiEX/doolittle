import { Button } from "@elizaos/ui/components/ui/button";
import { type FormEvent, useEffect, useState } from "react";
import {
  type AutomationDraft,
  buildAutomationRequest,
  createAutomationDraft,
  summarizeAutomation,
} from "./automation-model";
import { AutomationBuilder } from "./automations/AutomationBuilder";
import {
  type AutomationAction,
  AutomationWorkspace,
} from "./automations/AutomationWorkspace";

export { AutomationDeleteConfirmation } from "./automations/AutomationWorkspace";

import { AUTOMATION_PAGE_CLASS } from "./automations/layout";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
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
import { automationRequests } from "./resource-request-policy";

interface CronResponse {
  jobs?: unknown[];
  runs?: unknown[];
}

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
  const [draft, setDraft] = useState<AutomationDraft>(createAutomationDraft);
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
  const hasJobs = entries.length > 0;
  const showHeaderAction =
    showCreate || hasJobs || jobs.loading || Boolean(jobs.error);

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
    if (!active) return;
    const request = buildAutomationRequest(draft);
    if (!request.ok) {
      setFeedback({ message: request.error, tone: "bad" });
      return;
    }
    setBusy("create");
    setFeedback(null);
    try {
      await desktopRequest("/cron/jobs", "POST", request.payload);
      setDraft(createAutomationDraft());
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
    if (!active) return false;
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
    <div className={AUTOMATION_PAGE_CLASS}>
      <PageHeader
        eyebrow="Operations"
        title="Automations"
        description="Build local workflows from explicit triggers, conditions, and actions."
        actions={
          showHeaderAction ? (
            <Button
              disabled={!active}
              onClick={() => setShowCreate((value) => !value)}
              type="button"
              variant={showCreate ? "secondary" : "default"}
            >
              {showCreate ? "Close builder" : "New automation"}
            </Button>
          ) : null
        }
      />

      {!active ? (
        <OfflineRouteState>
          Automations stay local to the runtime and cannot be created or run
          while it is offline.
        </OfflineRouteState>
      ) : null}

      {active && hasJobs ? (
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
      ) : null}

      {active && showCreate ? (
        <AutomationBuilder
          busy={busy === "create"}
          draft={draft}
          onSubmit={create}
          onUpdate={updateDraft}
        />
      ) : null}

      {active && feedback ? (
        <Notice announce="status" tone={feedback.tone}>
          {feedback.message}
        </Notice>
      ) : null}

      {active ? (
        <AutomationWorkspace
          builderOpen={showCreate}
          busy={busy}
          jobs={entries}
          jobsError={jobs.error}
          jobsLoading={jobs.loading}
          onAction={act}
          onCreate={(starter) => {
            setDraft(createAutomationDraft(starter));
            setFeedback(null);
            setShowCreate(true);
          }}
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
      ) : null}
    </div>
  );
}

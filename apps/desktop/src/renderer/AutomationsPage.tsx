import type { BotCatalogResponse } from "@doolittle/contracts/bots";
import { Button } from "@doolittle/ui";
import { type FormEvent, useRef, useState } from "react";
import {
  type AutomationDraft,
  buildAutomationEditRequest,
  buildAutomationRequest,
  createAutomationDraft,
  editAutomationDraft,
} from "./automation-model";
import { AutomationBuilder } from "./automations/AutomationBuilder";
import {
  type AutomationAction,
  AutomationWorkspace,
} from "./automations/AutomationWorkspace";

export { AutomationDeleteConfirmation } from "./automations/AutomationWorkspace";

import { AUTOMATION_PAGE_CLASS } from "./automations/layout";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  type ActionFeedback,
  asArray,
  asRecord,
  asString,
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    initial: AutomationDraft;
  } | null>(null);
  const [draft, setDraft] = useState<AutomationDraft>(createAutomationDraft);
  const [busy, setBusy] = useState("");
  const mutationInFlight = useRef(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const entries = asArray(jobs.data?.jobs).map(asRecord);
  const runEntries = asArray(runs.data?.runs).map(asRecord);
  const selectedRun =
    runEntries.find((entry) => asString(entry.id) === selectedRunId) ??
    runEntries[0];
  const hasJobs = entries.length > 0;
  const bots = useApiResource<BotCatalogResponse>(
    active && (builderOpen || hasJobs) ? "/bots" : null,
    [active, builderOpen || hasJobs],
  );
  const updateDraft = <Key extends keyof AutomationDraft>(
    key: Key,
    value: AutomationDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    if (editing) setDraft(createAutomationDraft());
    setEditing(null);
  };

  const edit = (entry: UnknownRecord) => {
    const id = asString(entry.id);
    if (!active || !id || mutationInFlight.current) return;
    const initial = editAutomationDraft(entry);
    setEditing({ id, initial });
    setDraft(initial);
    setFeedback(null);
    setBuilderOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || mutationInFlight.current) return;
    const request = editing
      ? buildAutomationEditRequest(draft, editing.initial)
      : buildAutomationRequest(draft);
    if (!request.ok) {
      setFeedback({ message: request.error, tone: "bad" });
      return;
    }
    if (editing && Object.keys(request.payload).length === 0) {
      closeBuilder();
      setFeedback({ message: "No changes to save.", tone: "neutral" });
      return;
    }
    mutationInFlight.current = true;
    setBusy("save");
    setFeedback(null);
    try {
      await desktopRequest(
        editing ? `/cron/jobs/${encodeURIComponent(editing.id)}` : "/cron/jobs",
        editing ? "PATCH" : "POST",
        request.payload,
      );
      setDraft(createAutomationDraft());
      closeBuilder();
      setFeedback({
        message: editing ? "Automation updated." : "Automation created.",
        tone: "good",
      });
      jobs.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      mutationInFlight.current = false;
      setBusy("");
    }
  };

  const act = async (id: string, action: AutomationAction) => {
    if (!active || mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setBusy(`${id}:${action}`);
    setFeedback(null);
    try {
      const response = await desktopRequest<{ run?: { status?: string } }>(
        `/cron/jobs/${encodeURIComponent(id)}${action === "delete" ? "" : `/${action}`}`,
        action === "delete" ? "DELETE" : "POST",
        action === "trigger" ? {} : undefined,
      );
      setFeedback({
        message:
          action === "delete"
            ? "Automation deleted."
            : action === "trigger"
              ? response.run?.status === "completed"
                ? "Automation completed. The trace is ready."
                : response.run?.status === "failed"
                  ? "Automation failed. Review its trace."
                  : response.run?.status === "skipped"
                    ? "Automation skipped by its condition."
                    : "Trigger accepted. Review run history for its actual outcome."
              : `Automation ${action === "pause" ? "paused" : "resumed"}.`,
        tone:
          action === "trigger" && response.run?.status === "failed"
            ? "bad"
            : "good",
      });
      jobs.reload();
      runs.reload();
      return true;
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
      return false;
    } finally {
      mutationInFlight.current = false;
      setBusy("");
    }
  };

  return (
    <div className={AUTOMATION_PAGE_CLASS}>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <h2 className="m-0 text-base font-semibold">Scheduled work</h2>
        {active ? (
          <Button
            aria-controls="automation-builder"
            disabled={Boolean(busy)}
            onClick={() => {
              if (builderOpen) closeBuilder();
              else setBuilderOpen(true);
            }}
            type="button"
            variant={builderOpen ? "secondary" : "default"}
            aria-expanded={builderOpen}
          >
            {builderOpen ? "Close builder" : "New automation"}
          </Button>
        ) : null}
      </header>

      {!active ? (
        <OfflineRouteState>
          Automations stay local to the runtime and cannot be created or run
          while it is offline.
        </OfflineRouteState>
      ) : null}

      {active && builderOpen ? (
        <AutomationBuilder
          bots={bots.data?.bots}
          botsError={bots.error}
          botsLoading={bots.loading}
          busy={busy === "save" ? "saving" : busy ? "occupied" : undefined}
          draft={draft}
          editing={Boolean(editing)}
          key={editing?.id ?? "new"}
          onSubmit={save}
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
          botNames={Object.fromEntries(
            (bots.data?.bots ?? []).map((bot) => [bot.id, bot.name]),
          )}
          builderOpen={builderOpen}
          busy={busy}
          jobs={entries}
          jobsError={jobs.error}
          jobsLoading={jobs.loading}
          onAction={act}
          onCreate={(starter) => {
            setDraft(createAutomationDraft(starter));
            setFeedback(null);
            setBuilderOpen(true);
          }}
          onEdit={edit}
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

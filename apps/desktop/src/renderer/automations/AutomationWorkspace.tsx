import { ContextActionMenu } from "@doolittle/ui";
import { ArrowLeft, CalendarClock } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AutomationStarterChoice,
  summarizeAutomation,
} from "../automation-model";
import "./automation-workspace.css";
import { WorkbenchEmpty } from "../components/workbench/Workbench";
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
import { compactDuration } from "../orchestration-helpers";
import { statusTier } from "../work-surface/status";
import {
  DetailFacts,
  DetailHeader,
  FactRow,
  WorkActions,
  WorkCard,
  WorkCards,
  WorkConfirm,
  WorkDetail,
  WorkDisclosure,
  WorkList,
  WorkRail,
  WorkRow,
  WorkSplit,
  WorkTag,
} from "../work-surface/WorkSurface";
import { AutomationRunHistory } from "./AutomationRunHistory";

export type AutomationAction = "pause" | "resume" | "trigger" | "delete";

/** Width below which the split can no longer keep list rows and the detail
   pane readable side by side; matches the work-surface narrow breakpoint. */
const AUTOMATION_NARROW_SPLIT_PX = 680;

/** Tracks whether the split container is narrow enough to need single-pane
   navigation. A zero measurement means the element is not laid out yet (or
   the host has no layout engine), which is treated as wide so both panes
   render until a real measurement arrives. */
function useNarrowAutomationSplit(
  ref: RefObject<HTMLDivElement | null>,
): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      if (width > 0) setNarrow(width < AUTOMATION_NARROW_SPLIT_PX);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return narrow;
}

export function AutomationDeleteConfirmation({
  automationName,
  busy,
  returnFocusRef,
  onCancel,
  onConfirm,
}: {
  automationName: string;
  busy: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <WorkConfirm
      cancelDisabled={busy}
      confirmDisabled={busy}
      confirmLabel={busy ? "Deleting…" : "Confirm delete"}
      detail="This removes its configuration and stops future triggers."
      onCancel={onCancel}
      onConfirm={onConfirm}
      returnFocusRef={returnFocusRef}
      title={`Delete ${automationName}?`}
    />
  );
}

function automationTargetLabel(
  entry: UnknownRecord,
  botNames: Readonly<Record<string, string>>,
): string {
  const targetBotId = asString(entry.targetBotId);
  if (!targetBotId || targetBotId === "default") return "Doolittle";
  return botNames[targetBotId] ?? "Unavailable bot (no fallback)";
}

function automationTimingLabel(
  entry: UnknownRecord,
  status: string,
): string | undefined {
  const now = Date.now();
  const next = Date.parse(asString(entry.nextRunAt));
  const last = Date.parse(asString(entry.lastRunAt));
  const hasNext = Number.isFinite(next);
  const hasLast = Number.isFinite(last);
  if (status === "paused") {
    return hasLast
      ? `Last ran ${compactDuration(Math.max(0, now - last))} ago`
      : "Paused";
  }
  if (hasNext) {
    return next > now
      ? `Next in ${compactDuration(next - now)}`
      : `Due ${compactDuration(now - next)} ago`;
  }
  return hasLast
    ? `Last ran ${compactDuration(Math.max(0, now - last))} ago`
    : undefined;
}

function AutomationDetail({
  botNames,
  builderOpen,
  busy,
  entry,
  onAction,
  onEdit,
  onFeedback,
}: {
  botNames: Readonly<Record<string, string>>;
  builderOpen: boolean;
  busy: string;
  entry: UnknownRecord;
  onAction(id: string, action: AutomationAction): Promise<boolean>;
  onEdit(entry: UnknownRecord): void;
  onFeedback(message: string): void;
}) {
  const id = asString(entry.id);
  const status = asString(entry.status, "active");
  const summary = summarizeAutomation(entry);
  const name = asString(entry.name, "Automation");
  const target = automationTargetLabel(entry, botNames);
  const timing = automationTimingLabel(entry, status);
  const prompt = asString(entry.prompt, "No prompt configured.");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
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
          id: "edit",
          label: "Edit…",
          disabled: Boolean(busy) || builderOpen || confirmDelete,
          onSelect: () => onEdit(entry),
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
        ...(summary.webhookPath
          ? [
              {
                id: "copy-webhook",
                label: "Copy webhook path",
                onSelect: () => void copyWebhookPath(),
              },
            ]
          : []),
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
      <DetailHeader
        kicker={`Automation · ${titleCase(summary.triggerType)}`}
        status={
          <Badge tone={status === "paused" ? "warn" : "good"}>
            {titleCase(status)}
          </Badge>
        }
        tags={
          <>
            <WorkTag>{summary.triggerLabel}</WorkTag>
            <WorkTag>{summary.actionLabel}</WorkTag>
            {summary.conditionLabel !== "Always" ? (
              <WorkTag>If {summary.conditionLabel}</WorkTag>
            ) : null}
            <WorkTag>Runs as {target}</WorkTag>
            {timing ? <WorkTag>{timing}</WorkTag> : null}
          </>
        }
        title={name}
      />

      <WorkActions
        primary={
          <>
            <button
              className="primary-button"
              disabled={Boolean(busy) || status === "paused"}
              onClick={() => void onAction(id, "trigger")}
              type="button"
            >
              {busy === `${id}:trigger` ? "Running…" : "Run now"}
            </button>
            <button
              className="secondary-button"
              disabled={Boolean(busy) || builderOpen}
              onClick={() => onEdit(entry)}
              type="button"
            >
              Edit
            </button>
          </>
        }
        secondary={
          <>
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
              ref={deleteButtonRef}
              type="button"
            >
              Delete
            </button>
          </>
        }
      />

      {confirmDelete ? (
        <AutomationDeleteConfirmation
          automationName={name}
          busy={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void deleteAutomation()}
          returnFocusRef={deleteButtonRef}
        />
      ) : null}

      <WorkCards>
        <WorkCard kicker="Prompt">
          <p className="m-0 whitespace-pre-wrap text-[length:var(--text-control)] leading-[1.55] text-[var(--text-soft)]">
            {prompt}
          </p>
        </WorkCard>
        <WorkCard kicker="Definition">
          <DetailFacts>
            <FactRow label="Trigger">{summary.triggerLabel}</FactRow>
            <FactRow label="Condition">{summary.conditionLabel}</FactRow>
            <FactRow label="Action">{summary.actionLabel}</FactRow>
            <FactRow label="Target">{target}</FactRow>
          </DetailFacts>
        </WorkCard>
      </WorkCards>

      <WorkDisclosure
        detail="IDs, webhook path, and timestamps"
        summary="Internals"
      >
        <DetailFacts>
          <FactRow label="Automation ID">{id}</FactRow>
          {summary.webhookPath ? (
            <FactRow label="Webhook">
              <span className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[length:var(--text-meta)]">
                  {summary.webhookPath}
                </code>
                <button
                  className="text-button"
                  onClick={() => void copyWebhookPath()}
                  type="button"
                >
                  Copy
                </button>
              </span>
            </FactRow>
          ) : null}
          <FactRow label="Delivery">
            {titleCase(asString(entry.delivery, "local"))}
          </FactRow>
          <FactRow label="Created">
            {displayTimestamp(asString(entry.createdAt) || undefined)}
          </FactRow>
          <FactRow label="Updated">
            {displayTimestamp(asString(entry.updatedAt) || undefined)}
          </FactRow>
          <FactRow label="Last run">
            {displayTimestamp(asString(entry.lastRunAt) || undefined)}
          </FactRow>
          <FactRow label="Next run">
            {displayTimestamp(asString(entry.nextRunAt) || undefined)}
          </FactRow>
        </DetailFacts>
      </WorkDisclosure>
    </ContextActionMenu>
  );
}

export function AutomationWorkspace({
  builder,
  builderOpen,
  busy,
  jobs,
  jobsError,
  jobsLoading,
  onAction,
  onCreate,
  onEdit,
  onFeedback,
  onReloadJobs,
  onReloadRuns,
  onRunsOpenChange,
  onSelectRun,
  onToggleBuilder,
  runs,
  runsError,
  runsLoading,
  runsOpen,
  selectedRun,
  botNames = {},
}: {
  builder?: ReactNode;
  builderOpen: boolean;
  busy: string;
  jobs: UnknownRecord[];
  jobsError: string | null;
  jobsLoading: boolean;
  onAction(id: string, action: AutomationAction): Promise<boolean>;
  onCreate(starter: AutomationStarterChoice): void;
  onEdit(entry: UnknownRecord): void;
  onFeedback(message: string): void;
  onReloadJobs(): void;
  onReloadRuns(): void;
  onRunsOpenChange(open: boolean): void;
  onSelectRun(id: string): void;
  onToggleBuilder(): void;
  runs: UnknownRecord[];
  runsError: string | null;
  runsLoading: boolean;
  runsOpen: boolean;
  selectedRun?: UnknownRecord;
  botNames?: Readonly<Record<string, string>>;
}) {
  const [selection, setSelection] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<"back" | "row" | null>(null);
  const narrow = useNarrowAutomationSplit(splitRef);
  const selectedJob =
    jobs.find((entry) => asString(entry.id) === selection) ?? jobs[0];
  const selectedJobId = selectedJob ? asString(selectedJob.id) : "";
  // Narrow containers cannot fit both panes: the list and the detail trade
  // the whole width, and opening the builder is itself a detail navigation.
  const singlePane = narrow;
  const showDetail = !singlePane || detailOpen || builderOpen;
  const showList = !singlePane || !showDetail;
  // Single-pane navigation unmounts the pane focus was on; move focus with
  // the transition instead of dropping it to the document body.
  useEffect(() => {
    if (!singlePane || !focusTarget.current) return;
    const target = focusTarget.current;
    focusTarget.current = null;
    if (target === "back") {
      backButtonRef.current?.focus();
    } else {
      splitRef.current
        ?.querySelector<HTMLButtonElement>('.ws-row[aria-current="true"]')
        ?.focus();
    }
  });

  return (
    <WorkSplit
      className={singlePane ? "automation-split--single" : ""}
      ref={splitRef}
    >
      {showList ? (
        <WorkRail
          controls={
            <button
              aria-controls="automation-builder"
              aria-expanded={builderOpen}
              className="secondary-button"
              disabled={Boolean(busy)}
              onClick={onToggleBuilder}
              type="button"
            >
              {builderOpen ? "Close builder" : "New automation"}
            </button>
          }
          heading="Automations"
          meta={jobs.length ? `${jobs.length}` : undefined}
        >
          {jobsLoading ? (
            <LoadingBlock label="Loading automations…" />
          ) : jobsError ? (
            <ErrorBlock error={jobsError} retry={onReloadJobs} />
          ) : jobs.length ? (
            <WorkList>
              {jobs.map((entry, index) => {
                const id = asString(entry.id, String(index));
                const status = asString(entry.status, "active");
                const summary = summarizeAutomation(entry);
                const name = asString(entry.name, `Automation ${index + 1}`);
                return (
                  <WorkRow
                    key={id}
                    label={name}
                    meta={[
                      summary.triggerLabel,
                      `Runs as ${automationTargetLabel(entry, botNames)}`,
                    ]}
                    onSelect={() => {
                      setSelection(id);
                      if (singlePane) {
                        focusTarget.current = "back";
                        setDetailOpen(true);
                      }
                    }}
                    selected={id === selectedJobId}
                    status={titleCase(status)}
                    time={automationTimingLabel(entry, status)}
                    title={name}
                    tone={status === "paused" ? "muted" : statusTier(status)}
                  />
                );
              })}
            </WorkList>
          ) : (
            <WorkbenchEmpty
              actions={
                <button
                  aria-controls="automation-builder"
                  aria-expanded={builderOpen}
                  className="secondary-button"
                  disabled={Boolean(busy)}
                  onClick={onToggleBuilder}
                  type="button"
                >
                  New automation
                </button>
              }
              icon={CalendarClock}
              title="No automations"
            >
              Schedules and webhook runs appear here.
            </WorkbenchEmpty>
          )}
        </WorkRail>
      ) : null}

      {showDetail ? (
        <div className="automation-detail-column min-h-0 min-w-0 overflow-auto">
          {singlePane ? (
            <div className="automation-detail-back">
              <button
                className="text-button"
                onClick={() => {
                  // The rail's Close builder control is hidden in single-pane
                  // mode, so the back control doubles as the builder's exit.
                  if (builderOpen) onToggleBuilder();
                  focusTarget.current = "row";
                  setDetailOpen(false);
                }}
                ref={backButtonRef}
                type="button"
              >
                <ArrowLeft aria-hidden size={14} />
                Automations
              </button>
            </div>
          ) : null}
          {builder ? (
            <div className="mx-[var(--document-inset,12px)] mt-3.5">
              {builder}
            </div>
          ) : null}
          <WorkDetail>
            {selectedJob ? (
              <AutomationDetail
                botNames={botNames}
                builderOpen={builderOpen}
                busy={busy}
                entry={selectedJob}
                key={selectedJobId}
                onAction={onAction}
                onEdit={onEdit}
                onFeedback={onFeedback}
              />
            ) : jobsLoading || jobsError || builderOpen ? null : (
              <WorkbenchEmpty
                actions={
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => onCreate("weekday-brief")}
                      type="button"
                    >
                      Weekday brief
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => onCreate("webhook-triage")}
                      type="button"
                    >
                      Webhook triage
                    </button>
                  </>
                }
                icon={CalendarClock}
                title="No automations yet"
              >
                Starter automations prefill a name, trigger, and prompt.
              </WorkbenchEmpty>
            )}
          </WorkDetail>
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
      ) : null}
    </WorkSplit>
  );
}

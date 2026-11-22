import { ContextActionMenu } from "@doolittle/ui";
import { ChevronDown, History, RotateCw, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { UiIcon } from "../components/UiIcon";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import { copyContextText } from "../context-menu-clipboard";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  titleCase,
  type UnknownRecord,
} from "../lib";
import {
  AUTOMATION_DETAILS_SUMMARY_CLASS,
  AUTOMATION_RUN_BUTTON_CLASS,
  AUTOMATION_RUNS_PANEL_CLASS,
  AUTOMATION_STATUS_DOT_CLASS,
} from "./layout";
import "../orchestration/work-surfaces.css";

function runTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "failed") return "bad";
  if (status === "skipped") return "warn";
  if (status === "completed") return "good";
  return "neutral";
}

function runStatusClass(status: string): string {
  if (status === "failed") {
    return `${AUTOMATION_STATUS_DOT_CLASS} failed bg-[var(--bad)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--bad)_12%,transparent)]`;
  }
  if (status === "skipped") {
    return `${AUTOMATION_STATUS_DOT_CLASS} skipped bg-[var(--warn)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_12%,transparent)]`;
  }
  return AUTOMATION_STATUS_DOT_CLASS;
}

function AutomationTrace({ entry }: { entry: UnknownRecord }) {
  const status = asString(entry.status, "completed");
  const trace = useMemo(
    () => asArray(entry.trace).map(asRecord),
    [entry.trace],
  );
  return (
    <WorkbenchSection
      className="automation-trace"
      title={asString(entry.jobName, "Automation run")}
      icon={ScrollText}
      headingLevel={3}
      actions={<Badge tone={runTone(status)}>{titleCase(status)}</Badge>}
    >
      <ol className="work-trace-steps">
        {trace.length ? (
          trace.map((step, index) => {
            const stepStatus = asString(step.status, "completed");
            return (
              <li
                className="automation-trace-step relative grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-2.5 py-2"
                key={asString(step.id, String(index))}
              >
                <span
                  aria-hidden="true"
                  className={`${runStatusClass(stepStatus)} relative z-1 mt-0.75`}
                />
                <div className="automation-trace-step__content min-w-0">
                  <strong className="automation-trace-step__title text-[length:var(--text-control)]">
                    {titleCase(asString(step.phase, "step"))}
                  </strong>
                  <p className="mt-0.75 mb-0 text-[length:var(--text-control)] leading-[1.45] text-[var(--muted)]">
                    {asString(step.message, titleCase(stepStatus))}
                  </p>
                </div>
                <small className="work-trace-step-status">
                  {titleCase(stepStatus)}
                </small>
              </li>
            );
          })
        ) : (
          <li className="automation-trace-step relative grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-2.5 py-2">
            <span
              className={`${runStatusClass(status)} relative z-1 mt-0.75`}
            />
            <div className="automation-trace-step__content min-w-0">
              <strong className="automation-trace-step__title text-[length:var(--text-control)]">
                Legacy receipt
              </strong>
              <p className="mt-0.75 mb-0 text-[length:var(--text-control)] leading-[1.45] text-[var(--muted)]">
                This run predates phase-level trace capture.
              </p>
            </div>
          </li>
        )}
      </ol>
      <details className="automation-trace-output mt-2.5">
        <summary className={AUTOMATION_DETAILS_SUMMARY_CLASS}>Output</summary>
        <pre className="m-0 max-h-42.5 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2.5 font-[var(--font-mono)] text-[length:var(--text-control)] leading-[1.5] text-[var(--text-soft)]">
          {asString(entry.output, "No output was recorded.")}
        </pre>
      </details>
    </WorkbenchSection>
  );
}

export function AutomationRunHistory({
  onOpenChange,
  onReload,
  onSelectRun,
  open,
  quiet = false,
  runs,
  runsError,
  runsLoading,
  selectedRun,
}: {
  onOpenChange(open: boolean): void;
  onReload(): void;
  onSelectRun(id: string): void;
  open: boolean;
  quiet?: boolean;
  runs: UnknownRecord[];
  runsError: string | null;
  runsLoading: boolean;
  selectedRun?: UnknownRecord;
}) {
  return (
    <details
      className={`content-card work-disclosure ${AUTOMATION_RUNS_PANEL_CLASS}${quiet ? " is-quiet" : ""}`}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      open={open}
    >
      <summary>
        <span className="work-disclosure__identity">
          <UiIcon icon={History} size="md" />
          <strong>Run history</strong>
        </span>
        <span className="work-disclosure__meta">
          {open
            ? `${runs.length} loaded`
            : quiet
              ? "View past runs"
              : "Open to load"}
          <UiIcon icon={ChevronDown} />
        </span>
      </summary>
      {open ? (
        <div className="automation-runs-body m-4 mt-3.5">
          <div className="automation-runs-toolbar mb-2.5 flex items-center justify-between gap-3 text-[length:var(--text-control)] text-[var(--muted)]">
            <span>Recent runs</span>
            <WorkbenchAction
              emphasis="quiet"
              icon={RotateCw}
              onClick={onReload}
            >
              Refresh
            </WorkbenchAction>
          </div>
          {runsLoading ? (
            <LoadingBlock label="Loading traces…" />
          ) : runsError ? (
            <ErrorBlock error={runsError} retry={onReload} />
          ) : runs.length ? (
            <div className="automation-trace-layout grid grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)] gap-3 max-[820px]:grid-cols-1">
              <ul
                aria-label="Automation runs"
                className="automation-run-list m-0 flex max-h-61.5 list-none flex-col gap-0.75 overflow-auto p-0"
              >
                {runs.map((entry, index) => {
                  const id = asString(entry.id, String(index));
                  const status = asString(entry.status, "completed");
                  return (
                    <li key={id}>
                      <ContextActionMenu
                        label="Automation receipt actions"
                        scopeKey={`automation-run:${id}`}
                        items={[
                          {
                            id: "inspect",
                            label: "Inspect receipt",
                            onSelect: () => onSelectRun(id),
                          },
                          {
                            id: "copy-id",
                            label: "Copy run ID",
                            onSelect: () => void copyContextText(id),
                          },
                        ]}
                      >
                        <button
                          aria-pressed={asString(selectedRun?.id) === id}
                          className={`work-receipt-row ${AUTOMATION_RUN_BUTTON_CLASS}`}
                          onClick={() => onSelectRun(id)}
                          type="button"
                        >
                          <span className={runStatusClass(status)} />
                          <span className="flex min-w-0 flex-col gap-0.75">
                            <strong className="automation-run-list__title truncate text-[length:var(--text-control)] font-medium">
                              {asString(entry.jobName, "Automation run")}
                            </strong>
                            <small className="automation-run-list__meta text-[length:var(--text-control)] text-[var(--muted)]">
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
                      </ContextActionMenu>
                    </li>
                  );
                })}
              </ul>
              {selectedRun ? <AutomationTrace entry={selectedRun} /> : null}
            </div>
          ) : (
            <WorkbenchEmpty icon={ScrollText} title="No trace receipts">
              Run an automation to inspect its trigger, condition, action, and
              delivery phases.
            </WorkbenchEmpty>
          )}
        </div>
      ) : null}
    </details>
  );
}

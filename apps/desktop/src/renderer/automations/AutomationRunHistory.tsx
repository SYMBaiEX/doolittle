import { RotateCw, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { UiIcon } from "../components/UiIcon";
import { WorkbenchEmpty } from "../components/workbench/Workbench";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  titleCase,
  type UnknownRecord,
} from "../lib";
import { compactDuration } from "../orchestration-helpers";
import { statusTier } from "../work-surface/status";
import { WorkDisclosure, WorkRow } from "../work-surface/WorkSurface";
import {
  AUTOMATION_DETAILS_SUMMARY_CLASS,
  AUTOMATION_STATUS_DOT_CLASS,
} from "./layout";
import "../orchestration/work-surfaces.css";

function runStatusClass(status: string): string {
  if (status === "failed") {
    return `${AUTOMATION_STATUS_DOT_CLASS} failed bg-[var(--bad)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--bad)_12%,transparent)]`;
  }
  if (status === "skipped") {
    return `${AUTOMATION_STATUS_DOT_CLASS} skipped bg-[var(--warn)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_12%,transparent)]`;
  }
  return AUTOMATION_STATUS_DOT_CLASS;
}

function runDurationLabel(entry: UnknownRecord): string | undefined {
  const durationMs = asNumber(entry.durationMs);
  if (durationMs > 0) return compactDuration(durationMs);
  const started = Date.parse(asString(entry.startedAt));
  const completed = Date.parse(asString(entry.completedAt));
  if (Number.isFinite(started) && Number.isFinite(completed)) {
    return compactDuration(Math.max(0, completed - started));
  }
  return undefined;
}

function AutomationTrace({ entry }: { entry: UnknownRecord }) {
  const status = asString(entry.status, "completed");
  const triggerLabel = titleCase(asString(entry.triggerType, "schedule"));
  const duration = runDurationLabel(entry);
  const trace = useMemo(
    () => asArray(entry.trace).map(asRecord),
    [entry.trace],
  );
  return (
    <WorkDisclosure
      aside={displayTimestamp(
        asString(entry.completedAt, asString(entry.createdAt)) || undefined,
      )}
      detail={`${asString(entry.jobName, "Automation run")} · ${triggerLabel} · ${titleCase(status)}${duration ? ` · ${duration}` : ""}`}
      summary="Run diagnostics"
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
    </WorkDisclosure>
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
  const selectedRunId = selectedRun ? asString(selectedRun.id) : "";
  return (
    <details
      className="ws-disclosure automation-runs mx-[var(--document-inset,12px)] mb-[var(--document-inset,12px)]"
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      open={open}
    >
      <summary>
        <span>
          <strong>Run history</strong>
          <small>
            {open
              ? `${runs.length} loaded`
              : quiet
                ? "View past runs"
                : "Open to load"}
          </small>
        </span>
        <small>{open && runs.length ? `${runs.length} recent` : null}</small>
      </summary>
      {open ? (
        <div className="automation-runs-body pt-1.5">
          <div className="automation-runs-toolbar mb-2.5 flex items-center justify-between gap-3 text-[length:var(--text-control)] text-[var(--muted)]">
            <span>Recent runs</span>
            <button
              className="text-button inline-flex items-center gap-1.5"
              onClick={onReload}
              type="button"
            >
              <UiIcon icon={RotateCw} />
              Refresh
            </button>
          </div>
          {runsLoading ? (
            <LoadingBlock label="Loading traces…" />
          ) : runsError ? (
            <ErrorBlock error={runsError} retry={onReload} />
          ) : runs.length ? (
            <>
              <ul aria-label="Automation runs" className="ws-list">
                {runs.map((entry, index) => {
                  const id = asString(entry.id, String(index));
                  const status = asString(entry.status, "completed");
                  const duration = runDurationLabel(entry);
                  return (
                    <WorkRow
                      key={id}
                      label={`${asString(entry.jobName, "Automation run")} run`}
                      meta={[
                        titleCase(asString(entry.triggerType, "schedule")),
                        ...(duration ? [duration] : []),
                      ]}
                      onSelect={() => onSelectRun(id)}
                      selected={id === selectedRunId}
                      status={titleCase(status)}
                      time={displayTimestamp(
                        asString(
                          entry.completedAt,
                          asString(entry.createdAt),
                        ) || undefined,
                      )}
                      title={asString(entry.jobName, "Automation run")}
                      tone={statusTier(status)}
                    />
                  );
                })}
              </ul>
              {selectedRun ? (
                <AutomationTrace
                  entry={selectedRun}
                  key={selectedRunId || "run"}
                />
              ) : null}
            </>
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

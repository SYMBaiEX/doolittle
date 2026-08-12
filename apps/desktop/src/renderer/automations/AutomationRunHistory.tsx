import { useMemo } from "react";
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
      className={`content-card automation-runs-panel${quiet ? " is-quiet" : ""}`}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      open={open}
    >
      <summary>
        <span>
          <strong>{quiet ? "Run history" : "Trace receipts"}</strong>
          <small>
            {quiet ? "Receipts appear after execution" : "Execution history"}
          </small>
        </span>
        <span className="automation-runs-panel__meta">
          {open
            ? `${runs.length} loaded`
            : quiet
              ? "View past runs"
              : "Open to load"}
        </span>
      </summary>
      {open ? (
        <div className="automation-runs-body">
          <div className="automation-runs-toolbar">
            <span>Latest durable execution receipts</span>
            <button className="text-button" onClick={onReload} type="button">
              Refresh
            </button>
          </div>
          {runsLoading ? (
            <LoadingBlock label="Loading traces…" />
          ) : runsError ? (
            <ErrorBlock error={runsError} retry={onReload} />
          ) : runs.length ? (
            <div className="automation-trace-layout">
              <ul aria-label="Automation runs" className="automation-run-list">
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
            <EmptyBlock density="compact" title="No trace receipts">
              Run an automation to inspect its trigger, condition, action, and
              delivery phases.
            </EmptyBlock>
          )}
        </div>
      ) : null}
    </details>
  );
}

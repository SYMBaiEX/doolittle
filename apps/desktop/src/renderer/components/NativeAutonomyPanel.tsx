import { NativeSelect } from "@doolittle/ui";
import { Brain, Play, Square } from "lucide-react";
import { useId, useState } from "react";
import {
  type ActionFeedback,
  type ApiResource,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
} from "../lib";
import { DiagnosticStatusRow } from "../runtime-state/DiagnosticWorkspace";
import { WorkbenchAction, WorkbenchSection } from "./workbench/Workbench";

export interface NativeAutonomyResponse {
  data?: unknown;
  message?: string;
  success?: boolean;
}

const AUTONOMY_INTERVAL_OPTIONS = [
  5_000, 15_000, 30_000, 60_000, 300_000, 600_000,
] as const;

export function NativeAutonomyPanel({
  autonomy,
  readOnly = false,
}: {
  autonomy: ApiResource<NativeAutonomyResponse>;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const cadenceId = useId();
  const payload = asRecord(autonomy.data?.data);
  const enabled = payload.enabled === true;
  const running = payload.running === true;
  const interval = asNumber(payload.interval, 30_000);
  const character = asString(payload.characterName, "Doolittle");

  async function update(
    path: "/autonomy/enable" | "/autonomy/disable" | "/autonomy/interval",
    body: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await desktopRequest<NativeAutonomyResponse>(
        path,
        "POST",
        body,
      );
      setFeedback({
        message: result.message ?? "Native autonomy updated.",
        tone: "good",
      });
      autonomy.reload();
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="runtime-autonomy-panel" data-runtime-autonomy="true">
      <WorkbenchSection
        actions={
          <Badge tone={running ? "good" : enabled ? "warn" : "neutral"}>
            {running ? "Running" : enabled ? "Enabled" : "Off"}
          </Badge>
        }
        description="Eliza reasoning and action execution in the background."
        headingLevel={3}
        icon={Brain}
        title="Autonomy loop"
      >
        {autonomy.loading ? (
          <LoadingBlock label="Loading native autonomy…" />
        ) : autonomy.error ? (
          <ErrorBlock error={autonomy.error} retry={autonomy.reload} />
        ) : (
          <div className="grid gap-3">
            <DiagnosticStatusRow
              title={`${character} autonomous reasoning`}
              detail="Enabling it can consume provider tokens in the background."
            />
            <div
              className="runtime-autonomy-controls grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] items-end gap-2"
              data-runtime-controls="autonomy"
            >
              <label className="grid min-w-0 gap-1" htmlFor={cadenceId}>
                <span className="font-[var(--font-mono)] text-[length:var(--text-meta)] font-bold tracking-[0.055em] text-[var(--muted)] uppercase">
                  Cadence
                </span>
                <NativeSelect
                  aria-label="Native autonomy reasoning cadence"
                  className="w-full min-w-0"
                  disabled={busy || readOnly}
                  onChange={(event) =>
                    void update("/autonomy/interval", {
                      interval: Number(event.target.value),
                    })
                  }
                  id={cadenceId}
                  value={String(interval)}
                >
                  {!AUTONOMY_INTERVAL_OPTIONS.some(
                    (option) => option === interval,
                  ) ? (
                    <option value={interval}>
                      {Math.round(interval / 1000)} seconds
                    </option>
                  ) : null}
                  {AUTONOMY_INTERVAL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option < 60_000
                        ? `${option / 1000} seconds`
                        : `${option / 60_000} minute${option === 60_000 ? "" : "s"}`}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <WorkbenchAction
                className="w-full"
                disabled={busy || readOnly}
                emphasis={enabled ? "secondary" : "primary"}
                icon={enabled ? Square : Play}
                onClick={() =>
                  void update(
                    enabled ? "/autonomy/disable" : "/autonomy/enable",
                  )
                }
              >
                {busy
                  ? "Updating…"
                  : enabled
                    ? "Disable native autonomy"
                    : "Enable native autonomy"}
              </WorkbenchAction>
            </div>
            {readOnly ? (
              <small className="text-[var(--muted)]">
                Controls are disabled while the runtime is degraded.
              </small>
            ) : null}
            {feedback ? (
              <Notice tone={feedback.tone}>{feedback.message}</Notice>
            ) : null}
          </div>
        )}
      </WorkbenchSection>
    </div>
  );
}

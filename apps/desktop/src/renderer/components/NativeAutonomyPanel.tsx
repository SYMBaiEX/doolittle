import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
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
import {
  RUNTIME_CARD_CLASS,
  RUNTIME_CARD_HEADING_CLASS,
  RUNTIME_STATUS_ROW_CLASS,
} from "../runtime/runtime-layout";

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
    <section
      className={`runtime-autonomy-panel ${RUNTIME_CARD_CLASS} grid gap-2`}
      data-runtime-autonomy="true"
    >
      <div className={`${RUNTIME_CARD_HEADING_CLASS} min-w-0`}>
        <div>
          <span className="eyebrow">Eliza native</span>
          <h2>Autonomy loop</h2>
        </div>
        <Badge tone={running ? "good" : enabled ? "warn" : "neutral"}>
          {running ? "Running" : enabled ? "Enabled" : "Off"}
        </Badge>
      </div>
      {autonomy.loading ? (
        <LoadingBlock label="Loading native autonomy…" />
      ) : autonomy.error ? (
        <ErrorBlock error={autonomy.error} retry={autonomy.reload} />
      ) : (
        <>
          <div className={RUNTIME_STATUS_ROW_CLASS}>
            <div>
              <strong>{character} autonomous reasoning</strong>
              <small>
                Official Eliza prompt batching and action execution. Enabling it
                can consume provider tokens in the background.
              </small>
            </div>
          </div>
          <div
            className="runtime-autonomy-controls grid grid-cols-1 items-end gap-2 min-[521px]:max-[760px]:grid-cols-[minmax(140px,0.7fr)_minmax(180px,1fr)] min-[921px]:grid-cols-[minmax(148px,0.65fr)_minmax(190px,auto)]"
            data-runtime-controls="autonomy"
          >
            <label className="grid min-w-0 gap-1">
              <span className="font-[var(--font-mono)] text-[var(--text-meta)] font-bold tracking-[0.055em] text-[var(--muted)] uppercase">
                Cadence
              </span>
              <select
                aria-label="Native autonomy reasoning cadence"
                className="w-full min-w-0 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-2 py-[7px] text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                disabled={busy || readOnly}
                onChange={(event) =>
                  void update("/autonomy/interval", {
                    interval: Number(event.target.value),
                  })
                }
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
              </select>
            </label>
            <Button
              className="w-full min-w-0"
              disabled={busy || readOnly}
              onClick={() =>
                void update(enabled ? "/autonomy/disable" : "/autonomy/enable")
              }
              type="button"
              variant={enabled ? "outline" : "default"}
            >
              {busy
                ? "Updating…"
                : enabled
                  ? "Disable native autonomy"
                  : "Enable native autonomy"}
            </Button>
          </div>
          {readOnly ? (
            <small className="text-[var(--muted)]">
              Controls are disabled while the runtime is degraded.
            </small>
          ) : null}
          {feedback ? (
            <Notice tone={feedback.tone}>{feedback.message}</Notice>
          ) : null}
        </>
      )}
    </section>
  );
}

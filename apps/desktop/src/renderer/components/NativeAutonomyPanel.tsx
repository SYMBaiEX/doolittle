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
}: {
  autonomy: ApiResource<NativeAutonomyResponse>;
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
    <section className="content-card runtime-autonomy-panel">
      <div className="card-heading">
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
          <div className="status-row">
            <div>
              <strong>{character} autonomous reasoning</strong>
              <small>
                Official Eliza prompt batching and action execution. Disabled by
                default; enabling it can consume provider tokens in the
                background.
              </small>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>Reasoning cadence</span>
              <select
                aria-label="Native autonomy reasoning cadence"
                disabled={busy}
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
          </div>
          <div className="button-row">
            <Button
              className={enabled ? "secondary-button" : "primary-button"}
              disabled={busy}
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
          {feedback ? (
            <Notice tone={feedback.tone}>{feedback.message}</Notice>
          ) : null}
        </>
      )}
    </section>
  );
}

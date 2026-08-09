import { Badge, displayTimestamp } from "../lib";
import { type RunReceipt, runEventCopy, runEventKey } from "./models";

export function RunReceiptView({
  pending,
  receipt,
}: {
  pending: boolean;
  receipt: RunReceipt;
}) {
  const { latest } = receipt;
  const visibleEvents = receipt.events.filter(
    (event) => !["heartbeat", "message", "stream"].includes(event.type),
  );
  const summary =
    latest.run.terminalReason === "cancelled"
      ? "Stopped by operator"
      : latest.run.errorMessage ||
        latest.run.activeAction ||
        latest.run.statusDetail ||
        latest.run.lastAction ||
        latest.run.status;
  const tone =
    latest.run.status === "complete"
      ? "good"
      : latest.run.status === "error"
        ? "bad"
        : latest.run.status === "cancelled"
          ? "warn"
          : latest.run.pendingApprovals > 0
            ? "warn"
            : "neutral";

  return (
    <details className="chat-run-receipt">
      <summary>
        <span className={`chat-run-state ${tone}`} aria-hidden="true" />
        <span>
          <strong>{pending ? "Working" : "Run complete"}</strong>
          <small>{summary}</small>
        </span>
        <span className="chat-run-metrics">
          {latest.run.observedActionCount} actions ·{" "}
          {latest.run.localMutations.length} changes
        </span>
        <span className="chat-run-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <ol>
        {visibleEvents.slice(-14).map((event) => {
          const copy = runEventCopy(event);
          return (
            <li key={`${runEventKey(event)}:${event.run.updatedAt}`}>
              <span className={`chat-run-mark ${copy.tone}`} />
              <span>
                <strong>{copy.label}</strong>
                <small>{copy.detail}</small>
              </span>
              <time>{displayTimestamp(event.run.updatedAt)}</time>
            </li>
          );
        })}
      </ol>
      <footer>
        <Badge tone={tone}>{latest.run.status}</Badge>
        <code>{latest.run.runId}</code>
      </footer>
    </details>
  );
}

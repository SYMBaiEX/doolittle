import { ChevronRight } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
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
    <details className="group chat-run-receipt mb-0.75 overflow-hidden border-0 border-[color-mix(in_srgb,var(--border)_62%,transparent)] border-t bg-transparent whitespace-normal text-[var(--text-soft)] open:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] open:bg-[color-mix(in_srgb,var(--surface-soft)_24%,transparent)]">
      <summary className="grid min-h-6 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 bg-transparent px-0.75 py-0.5 [&::-webkit-details-marker]:hidden">
        <span
          className={`chat-run-state block size-1.5 shrink-0 rounded-full ${
            tone === "good"
              ? "bg-[var(--good)]"
              : tone === "warn"
                ? "bg-[var(--warn)]"
                : tone === "bad"
                  ? "bg-[var(--bad)]"
                  : "bg-[var(--muted)]"
          }`}
          aria-hidden="true"
        />
        <span className="flex min-w-0 items-baseline gap-1.75">
          <strong className="text-[length:var(--text-meta)] font-semibold text-[var(--text)]">
            {pending ? "Working" : "Run complete"}
          </strong>
          <small className="truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            {summary}
          </small>
        </span>
        <span className="chat-run-metrics whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.04em] text-[var(--faint)] max-[480px]:hidden">
          {latest.run.observedActionCount} actions ·{" "}
          {latest.run.localMutations.length} changes
        </span>
        <UiIcon
          className="chat-run-chevron text-[var(--faint)] transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
          icon={ChevronRight}
          size="xs"
        />
      </summary>
      <ol className="m-0 max-h-36 list-none overflow-y-auto border-[var(--border)] border-t px-2.75 py-0.75">
        {visibleEvents.slice(-14).map((event) => {
          const copy = runEventCopy(event);
          return (
            <li
              className="grid min-h-7 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b px-px py-1.25 last:border-b-0"
              key={`${runEventKey(event)}:${event.run.updatedAt}`}
            >
              <span
                className={`chat-run-mark block size-1.25 shrink-0 rounded-full ${
                  copy.tone === "good"
                    ? "bg-[var(--good)]"
                    : copy.tone === "warn"
                      ? "bg-[var(--warn)]"
                      : copy.tone === "bad"
                        ? "bg-[var(--bad)]"
                        : "bg-[var(--muted)]"
                }`}
              />
              <span className="flex min-w-0 flex-col gap-px">
                <strong className="truncate text-[length:var(--text-meta)] text-[var(--text-soft)]">
                  {copy.label}
                </strong>
                <small className="truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                  {copy.detail}
                </small>
              </span>
              <time className="whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] max-[480px]:hidden">
                {displayTimestamp(event.run.updatedAt)}
              </time>
            </li>
          );
        })}
      </ol>
      <footer className="flex items-center gap-2 border-[var(--border)] border-t px-2.75 py-1.25">
        <Badge tone={tone}>{latest.run.status}</Badge>
        <code className="truncate text-[length:var(--text-meta)] text-[var(--faint)]">
          {latest.run.runId}
        </code>
      </footer>
    </details>
  );
}

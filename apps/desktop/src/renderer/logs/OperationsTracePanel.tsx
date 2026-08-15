import { Button } from "@elizaos/ui/components/ui/button";
import {
  type ApiResource,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  type UnknownRecord,
} from "../lib";
import {
  OBSERVABILITY_CARD_CLASS,
  OBSERVABILITY_CARD_HEADING_CLASS,
  OBSERVABILITY_EYEBROW_CLASS,
} from "../observability-layout";

const TRACE_LIST_CLASS = "grid";
const TRACE_ROW_CLASS =
  "flex items-start justify-between gap-3 border-b border-[var(--border)] py-2 last:border-b-0 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-1 [&_strong]:truncate [&_small]:truncate [&_small]:text-[var(--muted)]";

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

export function OperationsTracePanel({
  commandEntries,
  deliveries,
  deliveryEntries,
  terminalHistory,
}: {
  commandEntries: UnknownRecord[];
  deliveries: ApiResource<DeliveriesResponse>;
  deliveryEntries: UnknownRecord[];
  terminalHistory: ApiResource<TerminalHistoryResponse>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 p-2 max-[920px]:grid-cols-1">
      <section className={`${OBSERVABILITY_CARD_CLASS} p-3`}>
        <div className={OBSERVABILITY_CARD_HEADING_CLASS}>
          <div>
            <span className={OBSERVABILITY_EYEBROW_CLASS}>Delivery state</span>
            <h2>Recent deliveries</h2>
          </div>
          <Button onClick={deliveries.reload} type="button" variant="ghost">
            Refresh
          </Button>
        </div>
        {deliveries.loading ? (
          <LoadingBlock />
        ) : deliveries.error ? (
          <ErrorBlock error={deliveries.error} retry={deliveries.reload} />
        ) : deliveryEntries.length ? (
          <div className={TRACE_LIST_CLASS}>
            {deliveryEntries.slice(0, 12).map((entry, index) => (
              <div
                className={TRACE_ROW_CLASS}
                key={`${asString(entry.id, "delivery")}:${String(index)}`}
              >
                <div>
                  <strong>
                    {asString(
                      entry.platform,
                      asString(entry.channel, "Delivery"),
                    )}
                  </strong>
                  <small>
                    {asString(
                      entry.preview,
                      asString(
                        entry.detail,
                        asString(entry.message, "No preview"),
                      ),
                    )}
                  </small>
                </div>
                <Badge>
                  {asString(entry.status, asString(entry.state, "recorded"))}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyBlock density="compact" title="No deliveries recorded">
            Delivery traces will appear here once gateway or home outputs run.
          </EmptyBlock>
        )}
      </section>
      <section className={`${OBSERVABILITY_CARD_CLASS} p-3`}>
        <div className={OBSERVABILITY_CARD_HEADING_CLASS}>
          <div>
            <span className={OBSERVABILITY_EYEBROW_CLASS}>Command trail</span>
            <h2>Terminal history</h2>
          </div>
          <Button
            onClick={terminalHistory.reload}
            type="button"
            variant="ghost"
          >
            Refresh
          </Button>
        </div>
        {terminalHistory.loading ? (
          <LoadingBlock />
        ) : terminalHistory.error ? (
          <ErrorBlock
            error={terminalHistory.error}
            retry={terminalHistory.reload}
          />
        ) : commandEntries.length ? (
          <div className={TRACE_LIST_CLASS}>
            {commandEntries.slice(0, 12).map((entry, index) => (
              <div
                className={TRACE_ROW_CLASS}
                key={`${asString(entry.command, "command")}:${String(index)}`}
              >
                <div>
                  <strong>{asString(entry.command, "Unknown command")}</strong>
                  <small>
                    {[
                      asString(entry.backend),
                      asString(entry.cwd),
                      asString(entry.status),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No command metadata"}
                  </small>
                </div>
                <Badge tone={entry.ok === false ? "bad" : "neutral"}>
                  {entry.ok === false
                    ? "Failed"
                    : entry.ok === true
                      ? "OK"
                      : asString(entry.exitCode, "Recorded")}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyBlock density="compact" title="No recent commands">
            Local terminal execution history has not been recorded yet.
          </EmptyBlock>
        )}
      </section>
    </div>
  );
}

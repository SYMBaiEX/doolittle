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
    <div className="two-column-grid operations-trace-grid">
      <section className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Delivery state</span>
            <h2>Recent deliveries</h2>
          </div>
          <Button
            className="text-button"
            onClick={deliveries.reload}
            type="button"
            variant="ghost"
          >
            Refresh
          </Button>
        </div>
        {deliveries.loading ? (
          <LoadingBlock />
        ) : deliveries.error ? (
          <ErrorBlock error={deliveries.error} retry={deliveries.reload} />
        ) : deliveryEntries.length ? (
          <div className="stack-list">
            {deliveryEntries.slice(0, 12).map((entry, index) => (
              <div
                className="status-row"
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
      <section className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Command trail</span>
            <h2>Terminal history</h2>
          </div>
          <Button
            className="text-button"
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
          <div className="stack-list">
            {commandEntries.slice(0, 12).map((entry, index) => (
              <div
                className="status-row"
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

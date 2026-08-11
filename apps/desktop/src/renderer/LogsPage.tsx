import { LogViewer } from "@elizaos/ui/cloud-ui/components/log-viewer";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  useApiResource,
} from "./lib";
import { toLogViewerEntries } from "./log-viewer-mapping";

interface LogsResponse {
  logs?: unknown[];
}

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

export function LogsPage({ active }: { active: boolean }) {
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const params = new URLSearchParams({ limit: "500" });
  if (level !== "all") params.set("level", level);
  if (query.trim()) params.set("query", query.trim());
  const resource = useApiResource<LogsResponse>(
    active ? `/logs?${params.toString()}` : null,
    [active, level, query],
  );
  const deliveries = useApiResource<DeliveriesResponse>(
    active ? "/deliveries" : null,
    [active],
  );
  const terminalHistory = useApiResource<TerminalHistoryResponse>(
    active ? "/terminal/history" : null,
    [active],
  );
  const entries = asArray(resource.data?.logs).map(asRecord);
  const logEntries = toLogViewerEntries(entries);
  const deliveryEntries = asArray(deliveries.data?.deliveries).map(asRecord);
  const commandEntries = asArray(terminalHistory.data?.commands).map(asRecord);

  return (
    <PagePanel className="page page-logs" variant="workspace">
      <PageHeader
        eyebrow="Operations"
        title="Logs"
        description="Inspect the redacted structured event stream emitted by the private local runtime."
        actions={
          <Button
            className="secondary-button"
            onClick={() => {
              resource.reload();
              deliveries.reload();
              terminalHistory.reload();
            }}
            type="button"
            variant="secondary"
          >
            Refresh
          </Button>
        }
      />
      <CompactStatStrip
        label="Operations summary"
        stats={[
          { label: "Log records", value: entries.length },
          { label: "Deliveries", value: deliveryEntries.length },
          { label: "Terminal commands", value: commandEntries.length },
          {
            label: "Filter",
            value: level === "all" ? "All" : level,
            tone: level === "all" ? "neutral" : "warn",
          },
        ]}
      />
      <LogViewer
        badges={[{ label: `${entries.length} records`, variant: "outline" }]}
        className="log-console"
        emptyState={{
          title: "No matching log events",
          description: "The current filters did not match any recent records.",
        }}
        entries={logEntries}
        error={resource.error || undefined}
        errorTitle="Could not load runtime logs"
        isFilteredEmpty={Boolean(query.trim() || level !== "all")}
        levelFilter={{
          value: level,
          onChange: setLevel,
          options: [
            { value: "all", label: "All levels" },
            { value: "trace", label: "Trace" },
            { value: "debug", label: "Debug" },
            { value: "info", label: "Info" },
            { value: "warn", label: "Warnings" },
            { value: "error", label: "Errors" },
            { value: "fatal", label: "Fatal" },
          ],
        }}
        loading={resource.loading}
        onRefresh={resource.reload}
        onRetry={resource.reload}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search messages, scopes, and details",
        }}
        title="Runtime logs"
      />
      <details className="operations-trace-details">
        <summary>
          <span>
            <strong>Delivery and terminal history</strong>
            <small>Secondary operational traces</small>
          </span>
          <span>
            {deliveryEntries.length} deliveries · {commandEntries.length}{" "}
            commands
          </span>
        </summary>
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
                      {asString(
                        entry.status,
                        asString(entry.state, "recorded"),
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock title="No deliveries recorded">
                Delivery traces will appear here once gateway or home outputs
                run.
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
                      <strong>
                        {asString(entry.command, "Unknown command")}
                      </strong>
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
              <EmptyBlock title="No recent commands">
                Local terminal execution history has not been recorded yet.
              </EmptyBlock>
            )}
          </section>
        </div>
      </details>
    </PagePanel>
  );
}

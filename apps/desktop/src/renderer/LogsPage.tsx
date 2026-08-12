import { LogViewer } from "@elizaos/ui/cloud-ui/components/log-viewer";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { asArray, asRecord, asString, PageHeader, useApiResource } from "./lib";
import { toLogViewerEntries } from "./log-viewer-mapping";
import { OperationsTracePanel } from "./logs/OperationsTracePanel";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const params = new URLSearchParams({ limit: "500" });
  if (level !== "all") params.set("level", level);
  if (query.trim()) params.set("query", query.trim());
  const resource = useApiResource<LogsResponse>(
    active ? `/logs?${params.toString()}` : null,
    [active, level, query],
  );
  const deliveries = useApiResource<DeliveriesResponse>(
    active && historyOpen ? "/deliveries" : null,
    [active, historyOpen],
  );
  const terminalHistory = useApiResource<TerminalHistoryResponse>(
    active && historyOpen ? "/terminal/history" : null,
    [active, historyOpen],
  );
  const entries = asArray(resource.data?.logs).map(asRecord);
  const logEntries = toLogViewerEntries(entries);
  const deliveryEntries = asArray(deliveries.data?.deliveries).map(asRecord);
  const commandEntries = asArray(terminalHistory.data?.commands).map(asRecord);
  const warningCount = entries.filter((entry) =>
    ["warn", "warning"].includes(asString(entry.level).toLowerCase()),
  ).length;
  const errorCount = entries.filter((entry) =>
    ["error", "fatal"].includes(asString(entry.level).toLowerCase()),
  ).length;

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
              if (historyOpen) {
                deliveries.reload();
                terminalHistory.reload();
              }
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
          { label: "Warnings", value: warningCount, tone: "warn" },
          { label: "Errors", value: errorCount, tone: "bad" },
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
      <details
        className="operations-trace-details"
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>Delivery and terminal history</strong>
            <small>Secondary operational traces</small>
          </span>
          <span>
            {historyOpen
              ? `${deliveryEntries.length} deliveries · ${commandEntries.length} commands`
              : "Open to load"}
          </span>
        </summary>
        {historyOpen ? (
          <OperationsTracePanel
            commandEntries={commandEntries}
            deliveries={deliveries}
            deliveryEntries={deliveryEntries}
            terminalHistory={terminalHistory}
          />
        ) : null}
      </details>
    </PagePanel>
  );
}

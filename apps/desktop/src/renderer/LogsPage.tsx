import { LogViewer } from "@elizaos/ui/cloud-ui/components/log-viewer";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asArray,
  asRecord,
  asString,
  PageHeader,
  useApiResource,
  useDebouncedValue,
} from "./lib";
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
  const debouncedQuery = useDebouncedValue(query.trim());
  const [historyOpen, setHistoryOpen] = useState(false);
  const params = new URLSearchParams({ limit: "500" });
  if (level !== "all") params.set("level", level);
  if (debouncedQuery) params.set("query", debouncedQuery);
  const resource = useApiResource<LogsResponse>(
    active ? `/logs?${params.toString()}` : null,
    [active, level, debouncedQuery],
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

  const refresh = () => {
    if (!active) return;
    resource.reload();
    if (historyOpen) {
      deliveries.reload();
      terminalHistory.reload();
    }
  };

  if (!active) {
    return (
      <PagePanel className="page page-logs" variant="workspace">
        <PageHeader
          eyebrow="Operations"
          title="Logs"
          description="Inspect the redacted structured event stream emitted by the private local runtime."
          actions={
            <Button
              className="secondary-button"
              disabled
              onClick={refresh}
              type="button"
              variant="secondary"
            >
              Refresh
            </Button>
          }
        />
        <OfflineRouteState>
          Runtime logs and secondary traces are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </PagePanel>
    );
  }

  return (
    <PagePanel className="page page-logs" variant="workspace">
      <PageHeader
        eyebrow="Operations"
        title="Logs"
        description="Inspect the redacted structured event stream emitted by the private local runtime."
        actions={
          <Button
            className="secondary-button"
            onClick={refresh}
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
        onRefresh={refresh}
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

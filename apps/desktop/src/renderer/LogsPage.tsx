import { Button } from "@elizaos/ui/button";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel/index";
import { Input } from "@elizaos/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { UiIcon } from "./components/UiIcon";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  asArray,
  asRecord,
  asString,
  Notice,
  useApiResource,
  useDebouncedValue,
} from "./lib";
import { toLogViewerEntries } from "./log-viewer-mapping";
import { OperationsTracePanel } from "./logs/OperationsTracePanel";
import { RuntimeLogStream } from "./logs/RuntimeLogStream";
import {
  OBSERVABILITY_CONTROL_CLASS,
  OBSERVABILITY_FILTER_CLASS,
} from "./observability-layout";

interface LogsResponse {
  logs?: unknown[];
}

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

const EMBEDDED_LOGS_CLASS =
  "settings-logs-section @container/observability min-w-0";

type RuntimeLogIntent = Extract<
  DesktopNavigationIntent,
  { kind: "runtime-log" }
>;

export function LogsPage({
  active,
  runtimeLogIntent,
  onConsumeNavigationIntent,
}: {
  active: boolean;
  runtimeLogIntent?: RuntimeLogIntent | null;
  onConsumeNavigationIntent?: (id: string) => void;
}) {
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [logSelection, setLogSelection] = useState<RuntimeLogIntent | null>(
    null,
  );
  const selectedLog = runtimeLogIntent ?? logSelection;
  const debouncedQuery = useDebouncedValue(query.trim());
  const [historyOpen, setHistoryOpen] = useState(false);
  const effectiveQuery = selectedLog?.target.query ?? debouncedQuery;
  const effectiveLevel = selectedLog ? "all" : level;
  useEffect(() => {
    if (!runtimeLogIntent) return;
    setLogSelection(runtimeLogIntent);
    setQuery(runtimeLogIntent.target.query);
    setLevel("all");
    onConsumeNavigationIntent?.(runtimeLogIntent.id);
  }, [onConsumeNavigationIntent, runtimeLogIntent]);
  const params = new URLSearchParams({ limit: "500" });
  if (effectiveLevel !== "all") params.set("level", effectiveLevel);
  if (effectiveQuery) params.set("query", effectiveQuery);
  const resource = useApiResource<LogsResponse>(
    active ? `/logs?${params.toString()}` : null,
    [active, effectiveLevel, effectiveQuery],
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
      <PagePanel className={EMBEDDED_LOGS_CLASS} variant="section">
        <header className="settings-section-header">
          <div>
            <span className="eyebrow">Operations</span>
            <h2>Logs</h2>
            <p>Redacted runtime events and local operational traces.</p>
          </div>
          <Button disabled onClick={refresh} type="button" variant="secondary">
            Refresh
          </Button>
        </header>
        <OfflineRouteState>
          Runtime logs and secondary traces are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </PagePanel>
    );
  }

  return (
    <PagePanel className={EMBEDDED_LOGS_CLASS} variant="section">
      <header className="settings-section-header">
        <div>
          <span className="eyebrow">Operations</span>
          <h2>Logs</h2>
          <p>Redacted runtime events and local operational traces.</p>
        </div>
        <Button onClick={refresh} type="button" variant="secondary">
          Refresh
        </Button>
      </header>
      <CompactStatStrip
        label="Operations summary"
        stats={[
          { label: "Log records", value: entries.length },
          { label: "Warnings", value: warningCount, tone: "warn" },
          { label: "Errors", value: errorCount, tone: "bad" },
        ]}
      />
      <div className={`${OBSERVABILITY_FILTER_CLASS} runtime-log-filters`}>
        <label htmlFor="runtime-log-search">
          <span className="sr-only">Search runtime logs</span>
          <Input
            className="h-[34px]"
            id="runtime-log-search"
            placeholder="Search logs"
            type="search"
            value={selectedLog?.target.query ?? query}
            onChange={(event) => {
              setLogSelection(null);
              setQuery(event.target.value);
            }}
          />
        </label>
        <select
          aria-label="Log level"
          className={OBSERVABILITY_CONTROL_CLASS}
          value={effectiveLevel}
          onChange={(event) => {
            setLogSelection(null);
            setLevel(event.target.value);
          }}
        >
          <option value="all">All levels</option>
          <option value="trace">Trace</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warnings</option>
          <option value="error">Errors</option>
          <option value="fatal">Fatal</option>
        </select>
      </div>
      {selectedLog &&
      resource.status === "ready" &&
      !logEntries.some((entry) => entry.id === selectedLog.target.logId) ? (
        <Notice tone="neutral">
          This event is no longer in the recent log history.
        </Notice>
      ) : null}
      <RuntimeLogStream
        entries={logEntries}
        error={resource.error || undefined}
        filtered={Boolean(effectiveQuery || effectiveLevel !== "all")}
        loading={resource.loading}
        onRetry={resource.reload}
        focusedLogId={selectedLog?.target.logId}
        focusRequestId={selectedLog?.id}
      />
      <details
        className="operations-trace-details overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] open:[&>summary]:border-b open:[&>summary]:border-[var(--border)]"
        data-operations-traces="true"
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-[18px] px-2.5 py-[7px] [&::-webkit-details-marker]:hidden">
          <span className="grid min-w-0 gap-px">
            <strong>Delivery and terminal history</strong>
            <small className="font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
              Secondary operational traces
            </small>
          </span>
          <span className="ml-auto font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            {historyOpen
              ? `${deliveryEntries.length} deliveries · ${commandEntries.length} commands`
              : "Open to load"}
          </span>
          <UiIcon
            className="text-[var(--muted)]"
            icon={historyOpen ? ChevronDown : ChevronRight}
            size="xs"
          />
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

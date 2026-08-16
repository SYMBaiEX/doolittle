import { LogViewer } from "@elizaos/ui/cloud-ui/components/log-viewer";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
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
import {
  logEntryBorderColor,
  logEntryClassName,
  logEntryLevelVariant,
  toLogViewerEntries,
} from "./log-viewer-mapping";
import { OperationsTracePanel } from "./logs/OperationsTracePanel";
import {
  OBSERVABILITY_CONTROL_CLASS,
  OBSERVABILITY_FILTER_CLASS,
  OBSERVABILITY_PAGE_CLASS,
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
      <PagePanel className={OBSERVABILITY_PAGE_CLASS} variant="workspace">
        <PageHeader
          eyebrow="Operations"
          title="Logs"
          description="Redacted runtime events and local operational traces."
          actions={
            <Button
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
    <PagePanel className={OBSERVABILITY_PAGE_CLASS} variant="workspace">
      <PageHeader
        eyebrow="Operations"
        title="Logs"
        description="Redacted runtime events and local operational traces."
        actions={
          <Button onClick={refresh} type="button" variant="secondary">
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
        ]}
      />
      <div className={OBSERVABILITY_FILTER_CLASS}>
        <label htmlFor="runtime-log-search">
          <span className="sr-only">Search runtime logs</span>
          <Input
            className="h-[34px]"
            id="runtime-log-search"
            placeholder="Search logs"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Log level"
          className={OBSERVABILITY_CONTROL_CLASS}
          value={level}
          onChange={(event) => setLevel(event.target.value)}
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
      <LogViewer
        className="overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)] bg-[#0e0d0c] p-0 [html[data-appearance=light]_&]:bg-[#f5f1eb] [&>:not(:last-child)]:hidden [&>:last-child]:grid [&>:last-child]:gap-0 [&>:last-child>:first-child]:min-h-[38px] [&>:last-child>:first-child]:items-center [&>:last-child>:first-child]:border-[var(--border)] [&>:last-child>:first-child]:px-2.5 [&>:last-child>:first-child]:py-[7px] [&_h2]:text-[var(--text)] [&_h2]:text-[length:var(--text-control)] [&_h2]:font-semibold"
        emptyState={{
          title: "No matching log events",
          description: "The current filters did not match any recent records.",
        }}
        entries={logEntries}
        entryClassName={logEntryClassName}
        entryLevelBorderColor={logEntryBorderColor}
        entryLevelVariant={logEntryLevelVariant}
        error={resource.error || undefined}
        errorTitle="Could not load runtime logs"
        heightClassName="h-[clamp(18rem,56vh,35rem)] rounded-none border-0 max-[700px]:h-[clamp(18rem,54svh,26rem)] [&_[data-slot=badge]]:h-[18px] [&_[data-slot=badge]]:min-w-[3.2rem] [&_[data-slot=badge]]:justify-center [&_[data-slot=badge]]:px-[5px] [&_[data-slot=badge]]:text-[9px] [&_[data-slot=scroll-area-viewport]>div>div]:px-[9px] [&_[data-slot=scroll-area-viewport]>div>div]:py-[7px] [&_[data-slot=scroll-area-viewport]>div>div]:text-[length:var(--text-meta)]"
        isFilteredEmpty={Boolean(query.trim() || level !== "all")}
        loading={resource.loading}
        onRetry={resource.reload}
        title="Event stream"
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
          <span
            aria-hidden="true"
            className="font-[var(--font-mono)] text-[var(--muted)]"
          >
            {historyOpen ? "−" : "+"}
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

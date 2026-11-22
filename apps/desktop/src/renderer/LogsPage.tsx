import { Input, NativeSelect } from "@doolittle/ui";
import { ListFilter, RotateCw, Search, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { UiIcon } from "./components/UiIcon";
import { WorkbenchAction } from "./components/workbench/Workbench";
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
  DiagnosticDisclosure,
  DiagnosticWorkspace,
} from "./runtime-state/DiagnosticWorkspace";

interface LogsResponse {
  logs?: unknown[];
}

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

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
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const hasFilters = Boolean(query || selectedLog || level !== "all");
  const clearFilters = () => {
    setLogSelection(null);
    setQuery("");
    setLevel("all");
    searchInputRef.current?.focus();
  };

  return (
    <DiagnosticWorkspace
      actions={
        <WorkbenchAction disabled={!active} icon={RotateCw} onClick={refresh}>
          Refresh
        </WorkbenchAction>
      }
      className="@container/observability"
      description="Search the local runtime’s redacted events, delivery traces, and command history."
      icon={ListFilter}
      title="Logs"
    >
      {!active ? (
        <OfflineRouteState>
          Runtime logs and secondary traces are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      ) : (
        <>
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
            summary={
              !resource.loading && !resource.error ? (
                <CompactStatStrip
                  label="Visible events summary"
                  stats={[
                    { label: "Log records", value: entries.length },
                    {
                      label: "Warnings",
                      value: warningCount,
                      tone: warningCount ? "warn" : "neutral",
                    },
                    {
                      label: "Errors",
                      value: errorCount,
                      tone: errorCount ? "bad" : "neutral",
                    },
                  ]}
                />
              ) : null
            }
            filters={
              <div className="runtime-log-filters">
                <div className="runtime-log-filters__search">
                  <UiIcon icon={Search} />
                  <Input
                    aria-label="Search runtime logs"
                    className="runtime-log-filters__input"
                    id="runtime-log-search"
                    placeholder="Search logs"
                    ref={searchInputRef}
                    type="search"
                    value={selectedLog?.target.query ?? query}
                    onChange={(event) => {
                      setLogSelection(null);
                      setQuery(event.target.value);
                    }}
                  />
                </div>
                <NativeSelect
                  aria-label="Log level"
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
                </NativeSelect>
                {hasFilters ? (
                  <WorkbenchAction
                    emphasis="quiet"
                    icon={X}
                    onClick={clearFilters}
                  >
                    Clear filters
                  </WorkbenchAction>
                ) : null}
              </div>
            }
          />
          <DiagnosticDisclosure
            description="Recent gateway deliveries and local commands"
            icon={SquareTerminal}
            meta={
              historyOpen
                ? `${deliveryEntries.length} deliveries · ${commandEntries.length} commands`
                : undefined
            }
            onToggle={setHistoryOpen}
            title="Delivery and terminal history"
          >
            {historyOpen ? (
              <OperationsTracePanel
                commandEntries={commandEntries}
                deliveries={deliveries}
                deliveryEntries={deliveryEntries}
                terminalHistory={terminalHistory}
              />
            ) : null}
          </DiagnosticDisclosure>
        </>
      )}
    </DiagnosticWorkspace>
  );
}

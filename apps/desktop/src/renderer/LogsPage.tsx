import { useState } from "react";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  PageHeader,
  useApiResource,
} from "./lib";

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
    [active, level],
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
  const deliveryEntries = asArray(deliveries.data?.deliveries).map(asRecord);
  const commandEntries = asArray(terminalHistory.data?.commands).map(asRecord);

  return (
    <div className="page page-logs">
      <PageHeader
        eyebrow="Operations"
        title="Logs"
        description="Inspect the redacted structured event stream emitted by the private local runtime."
        actions={
          <button
            className="secondary-button"
            onClick={() => {
              resource.reload();
              deliveries.reload();
              terminalHistory.reload();
            }}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard label="Log records" value={entries.length} />
        <MetricCard label="Deliveries" value={deliveryEntries.length} />
        <MetricCard label="Terminal commands" value={commandEntries.length} />
        <MetricCard label="Filter" value={level === "all" ? "All" : level} />
      </div>
      <div className="filter-bar">
        <form
          className="search-field grow"
          onSubmit={(event) => {
            event.preventDefault();
            resource.reload();
          }}
        >
          <input
            aria-label="Search runtime logs"
            placeholder="Search messages, scopes, and details"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <select
          aria-label="Log level"
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
      {resource.loading ? (
        <LoadingBlock label="Reading event log…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : entries.length ? (
        <section className="log-console" aria-label="Runtime logs">
          {entries.map((entry) => {
            const logLevel = asString(entry.level, "info");
            return (
              <article
                className="log-row"
                key={`${asString(entry.at)}:${asString(entry.scope)}:${asString(
                  entry.message,
                )}`}
              >
                <time>{displayTimestamp(asString(entry.at) || undefined)}</time>
                <Badge
                  tone={
                    logLevel === "error" || logLevel === "fatal"
                      ? "bad"
                      : logLevel === "warn"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {logLevel}
                </Badge>
                <code>{asString(entry.scope, "runtime")}</code>
                <div>
                  <strong>{asString(entry.message, "Event")}</strong>
                  {entry.detail ? <p>{asString(entry.detail)}</p> : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyBlock title="No matching log events">
          The current filters did not match any recent records.
        </EmptyBlock>
      )}
      <div className="two-column-grid" style={{ marginTop: "16px" }}>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Delivery state</span>
              <h2>Recent deliveries</h2>
            </div>
            <button
              className="text-button"
              onClick={deliveries.reload}
              type="button"
            >
              Refresh
            </button>
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
            <EmptyBlock title="No deliveries recorded">
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
            <button
              className="text-button"
              onClick={terminalHistory.reload}
              type="button"
            >
              Refresh
            </button>
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
    </div>
  );
}

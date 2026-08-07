import { type FormEvent, useMemo, useState } from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  useApiResource,
} from "../lib";
import "./mcp-control-panel.css";

export interface McpToolSummary {
  name: string;
  description: string;
  inputCount: number;
}

interface McpStatus {
  enabled?: boolean;
  detail?: string;
  serverCount?: number;
  connectedServers?: number;
  failedServers?: number;
  servers?: unknown[];
  discoveredTools?: number;
  cachedToolNames?: unknown[];
  lastProbeAt?: string;
  lastDiscoveryAt?: string;
  lastInvocationAt?: string;
  lastError?: string;
}

interface McpServerSummary {
  name: string;
  status: string;
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
  error: string;
}

interface McpStatusResponse {
  mcp?: McpStatus;
}

interface McpToolsResponse {
  tools?: unknown[];
}

interface McpToolResponse {
  tool?: unknown;
  detail?: string;
}

export function normalizeMcpTools(value: unknown): McpToolSummary[] {
  return asArray(value)
    .map((entry): McpToolSummary | null => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      const schema = asRecord(record.inputSchema);
      return {
        name,
        description: asString(
          record.description,
          "No description provided by this MCP server.",
        ),
        inputCount: Object.keys(asRecord(schema.properties)).length,
      };
    })
    .filter((tool): tool is McpToolSummary => tool !== null);
}

export function normalizeMcpServers(value: unknown): McpServerSummary[] {
  return asArray(value)
    .map((entry): McpServerSummary | null => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        status: asString(record.status, "unknown"),
        toolCount: asNumber(record.toolCount, 0),
        resourceCount: asNumber(record.resourceCount, 0),
        resourceTemplateCount: asNumber(record.resourceTemplateCount, 0),
        error: asString(record.error),
      };
    })
    .filter((server): server is McpServerSummary => server !== null);
}

export function mcpStatusLabel(status: McpStatus | undefined): string {
  if (!status) return "Checking";
  if (!status.enabled) return "Not configured";
  if (asNumber(status.failedServers, 0) > 0) return "Needs attention";
  return asNumber(status.connectedServers, 0) ===
    asNumber(status.serverCount, 0)
    ? "Connected"
    : "Connecting";
}

export function McpControlPanel({ active }: { active: boolean }) {
  const status = useApiResource<McpStatusResponse>(
    active ? "/mcp/status" : null,
    [active],
  );
  const cached = useApiResource<McpToolsResponse>(
    active ? "/mcp/cached" : null,
    [active],
  );
  const [draftQuery, setDraftQuery] = useState("");
  const [toolQuery, setToolQuery] = useState("");
  const search = useApiResource<McpToolsResponse>(
    active && toolQuery
      ? `/mcp/cached/search?query=${encodeURIComponent(toolQuery)}`
      : null,
    [active, toolQuery],
  );
  const [selectedName, setSelectedName] = useState("");
  const selected = useApiResource<McpToolResponse>(
    active && selectedName
      ? `/mcp/tool?name=${encodeURIComponent(selectedName)}`
      : null,
    [active, selectedName],
  );
  const [probing, setProbing] = useState(false);
  const [probeNotice, setProbeNotice] = useState("");

  const bridge = status.data?.mcp;
  const configured = bridge?.enabled === true;
  const healthy =
    configured &&
    asNumber(bridge?.connectedServers, 0) === asNumber(bridge?.serverCount, 0);
  const allTools = useMemo(
    () => normalizeMcpTools(cached.data?.tools),
    [cached.data?.tools],
  );
  const searchedTools = useMemo(
    () => normalizeMcpTools(search.data?.tools),
    [search.data?.tools],
  );
  const visibleTools = toolQuery ? searchedTools : allTools;
  const servers = normalizeMcpServers(bridge?.servers);
  const selectedTool = normalizeMcpTools(
    selected.data?.tool ? [selected.data.tool] : [],
  )[0];
  const loading = status.loading || cached.loading;
  const staticError = status.error || cached.error;

  const refresh = () => {
    status.reload();
    cached.reload();
    search.reload();
    selected.reload();
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setToolQuery(draftQuery.trim().slice(0, 256));
  };

  const probe = async () => {
    if (!configured || probing) return;
    setProbing(true);
    setProbeNotice("");
    try {
      const result = await desktopRequest<{
        probe?: { ok?: boolean; detail?: string };
      }>("/mcp/probe", "POST");
      const ok = result.probe?.ok === true;
      const detail = asString(
        result.probe?.detail,
        "The Eliza MCP service did not return a probe detail.",
      );
      setProbeNotice(`${ok ? "Probe passed" : "Probe failed"}: ${detail}`);
      status.reload();
      cached.reload();
    } catch (cause) {
      setProbeNotice(`Probe failed: ${errorMessage(cause)}`);
    } finally {
      setProbing(false);
    }
  };

  return (
    <section
      aria-labelledby="mcp-control-heading"
      className="mcp-control-panel"
    >
      <header className="mcp-control-header">
        <div>
          <span className="eyebrow">Model Context Protocol</span>
          <h2 id="mcp-control-heading">MCP connections</h2>
          <p>
            Inspect Eliza-managed MCP servers, connection health, and their
            discovered tools without invoking them.
          </p>
        </div>
        <div className="mcp-control-actions">
          <Badge tone={healthy ? "good" : "warn"}>
            {mcpStatusLabel(bridge)}
          </Badge>
          <button className="secondary-button" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
      </header>

      {loading ? <LoadingBlock label="Reading MCP connections…" /> : null}
      {staticError ? (
        <Notice tone="bad">
          Could not read the Eliza MCP service: {staticError}
        </Notice>
      ) : null}

      {!loading && !staticError ? (
        <>
          <div className="mcp-control-summary">
            <div>
              <span>Eliza servers</span>
              <strong>
                {asNumber(bridge?.connectedServers, 0)} /{" "}
                {asNumber(bridge?.serverCount, 0)} connected
              </strong>
              <small>{bridge?.detail || "No MCP status returned."}</small>
            </div>
            <div>
              <span>Cached tools</span>
              <strong>
                {asNumber(bridge?.discoveredTools, allTools.length)}
              </strong>
              <small>
                Last discovery {displayTimestamp(bridge?.lastDiscoveryAt)}
              </small>
            </div>
            <div>
              <span>Last probe</span>
              <strong>{displayTimestamp(bridge?.lastProbeAt)}</strong>
              <small>{bridge?.lastError || "No bridge error recorded."}</small>
            </div>
          </div>

          {!configured ? (
            <Notice tone="warn">
              Add a server under <code>settings.mcp.servers</code> and restart
              the runtime. Eliza validates the configuration and owns the
              connection lifecycle.
            </Notice>
          ) : (
            <div className="mcp-control-probe">
              <div>
                <strong>Connection diagnostics</strong>
                <span>
                  Probe the official Eliza service and refresh its tool
                  projection.
                </span>
              </div>
              <button
                className="secondary-button"
                disabled={probing}
                onClick={() => void probe()}
                type="button"
              >
                {probing ? "Probing…" : "Probe connection"}
              </button>
            </div>
          )}
          {probeNotice ? (
            <Notice
              tone={probeNotice.startsWith("Probe passed") ? "good" : "bad"}
            >
              {probeNotice}
            </Notice>
          ) : null}

          {servers.length ? (
            <div className="mcp-control-servers">
              <div className="mcp-control-browser-header">
                <div>
                  <span className="eyebrow">Eliza connection registry</span>
                  <h3>Configured servers</h3>
                </div>
                <Badge tone="neutral">{servers.length} active</Badge>
              </div>
              <div className="mcp-control-server-grid">
                {servers.map((server) => (
                  <article key={server.name}>
                    <div>
                      <code>{server.name}</code>
                      <Badge
                        tone={server.status === "connected" ? "good" : "warn"}
                      >
                        {server.status}
                      </Badge>
                    </div>
                    <span>
                      {server.toolCount} tools · {server.resourceCount}{" "}
                      resources · {server.resourceTemplateCount} templates
                    </span>
                    {server.error ? <small>{server.error}</small> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mcp-control-browser">
            <div className="mcp-control-browser-header">
              <div>
                <span className="eyebrow">Read-only registry</span>
                <h3>Available MCP tools</h3>
              </div>
              <Badge tone="neutral">{visibleTools.length} shown</Badge>
            </div>
            <form className="mcp-control-search" onSubmit={submitSearch}>
              <input
                aria-label="Search MCP tools"
                maxLength={256}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search cached tools"
                type="search"
                value={draftQuery}
              />
              <button
                aria-label="Search MCP tools"
                className="secondary-button"
                type="submit"
              >
                Search
              </button>
              {toolQuery ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setDraftQuery("");
                    setToolQuery("");
                  }}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </form>
            {search.loading ? (
              <LoadingBlock label="Searching cached MCP tools…" />
            ) : null}
            {search.error ? (
              <Notice tone="bad">
                Could not search cached MCP tools: {search.error}
              </Notice>
            ) : null}
            {!search.loading && !search.error && !visibleTools.length ? (
              <EmptyBlock title="No cached MCP tools">
                {toolQuery
                  ? "Try a broader search."
                  : "Probe a configured MCP connection to populate this registry."}
              </EmptyBlock>
            ) : null}
            {visibleTools.length ? (
              <div className="mcp-control-tool-grid">
                <ul aria-label="MCP tools" className="mcp-control-tool-list">
                  {visibleTools.map((tool) => (
                    <li key={tool.name}>
                      <button
                        aria-pressed={selectedName === tool.name}
                        className={
                          selectedName === tool.name ? "selected" : undefined
                        }
                        onClick={() => setSelectedName(tool.name)}
                        type="button"
                      >
                        <code>{tool.name}</code>
                        <span>{tool.description}</span>
                        <small>
                          {tool.inputCount} input
                          {tool.inputCount === 1 ? "" : "s"}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
                <aside className="mcp-control-detail">
                  {selected.loading ? (
                    <LoadingBlock label="Reading tool schema…" />
                  ) : selected.error ? (
                    <Notice tone="bad">
                      Could not read this tool: {selected.error}
                    </Notice>
                  ) : selectedName && selectedTool ? (
                    <>
                      <span className="eyebrow">Tool details</span>
                      <code>{selectedTool.name}</code>
                      <p>{selectedTool.description}</p>
                      <small>
                        {selectedTool.inputCount} declared input
                        {selectedTool.inputCount === 1 ? "" : "s"}
                      </small>
                      {selected.data?.detail ? (
                        <pre>{selected.data.detail}</pre>
                      ) : null}
                    </>
                  ) : (
                    <p>
                      Select a tool to inspect its cached definition. Execution
                      stays inside chat approval flows.
                    </p>
                  )}
                </aside>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

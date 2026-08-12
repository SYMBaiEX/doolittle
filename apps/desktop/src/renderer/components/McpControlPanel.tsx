import { type FormEvent, useMemo, useState } from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  errorMessage,
  LoadingBlock,
  Notice,
  useApiResource,
} from "../lib";
import { CompactStatStrip } from "./CompactStatStrip";
import { McpCachedToolsPanel } from "./mcp-control/McpCachedToolsPanel";
import { McpMarketplacePanel } from "./mcp-control/McpMarketplacePanel";
import "./mcp-control-panel.css";

export interface McpToolSummary {
  name: string;
  description: string;
  inputCount: number;
}
export interface McpMarketplaceSummary {
  name: string;
  title: string;
  description: string;
  version: string;
  connectionType: string;
  repositoryUrl: string;
  isLatest: boolean;
}
export interface McpMarketplaceRequirement {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
}
export interface McpMarketplaceDetail {
  name: string;
  version: string;
  repositoryUrl: string;
  transports: string[];
  environment: McpMarketplaceRequirement[];
  headers: McpMarketplaceRequirement[];
  config: unknown;
}
interface McpStatus {
  enabled?: boolean;
  detail?: string;
  serverCount?: number;
  connectedServers?: number;
  failedServers?: number;
  servers?: unknown[];
  discoveredTools?: number;
  lastProbeAt?: string;
  lastDiscoveryAt?: string;
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
interface MarketplaceResponse {
  marketplace?: { results?: unknown[]; error?: string };
}
interface MarketplaceDetailResponse {
  marketplace?: { server?: unknown; config?: unknown; error?: string };
}

export function normalizeMcpTools(value: unknown): McpToolSummary[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        description: asString(
          record.description,
          "No description provided by this MCP server.",
        ),
        inputCount: Object.keys(
          asRecord(asRecord(record.inputSchema).properties),
        ).length,
      };
    })
    .filter((tool): tool is McpToolSummary => tool !== null);
}
export function normalizeMcpServers(value: unknown): McpServerSummary[] {
  return asArray(value)
    .map((entry) => {
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
export function normalizeMcpMarketplace(
  value: unknown,
): McpMarketplaceSummary[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        title: asString(record.title, name),
        description: asString(record.description, "No description provided."),
        version: asString(record.version, "Unknown"),
        connectionType: asString(record.connectionType, "unknown"),
        repositoryUrl: safeHttpUrl(record.repositoryUrl),
        isLatest: record.isLatest === true,
      };
    })
    .filter((server): server is McpMarketplaceSummary => server !== null);
}
function normalizeRequirements(value: unknown): McpMarketplaceRequirement[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        description: asString(record.description),
        required: record.isRequired === true,
        secret: record.isSecret === true,
      };
    })
    .filter((item): item is McpMarketplaceRequirement => item !== null);
}
export function normalizeMcpMarketplaceDetail(
  server: unknown,
  config: unknown,
): McpMarketplaceDetail | undefined {
  const record = asRecord(server);
  const name = asString(record.name).trim();
  if (!name) return undefined;
  const remotes = asArray(record.remotes).map(asRecord);
  const packages = asArray(record.packages).map(asRecord);
  return {
    name,
    version: asString(record.version, "Unknown"),
    repositoryUrl: safeHttpUrl(asRecord(record.repository).url),
    transports: [
      ...remotes.map((remote) => asString(remote.type, "streamable-http")),
      ...packages.map((entry) =>
        asString(asRecord(entry.transport).type, "stdio"),
      ),
    ].filter(Boolean),
    environment: packages.flatMap((entry) =>
      normalizeRequirements(entry.environmentVariables),
    ),
    headers: remotes.flatMap((remote) => normalizeRequirements(remote.headers)),
    config,
  };
}
function safeHttpUrl(value: unknown): string {
  const url = asString(value).trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
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
export function mcpLiveStatus(
  status: McpStatus | undefined,
  toolCount: number,
  selectedToolName = "",
  selectedMarketplaceName = "",
): string {
  if (!status) return "Checking MCP connections.";
  const summary = [
    `MCP ${mcpStatusLabel(status).toLowerCase()}.`,
    `${asNumber(status.connectedServers, 0)} of ${asNumber(status.serverCount, 0)} servers connected.`,
    `${toolCount} cached tool${toolCount === 1 ? "" : "s"}.`,
  ];
  if (selectedToolName)
    summary.push(`Tool details selected: ${selectedToolName}.`);
  if (selectedMarketplaceName)
    summary.push(`Registry definition selected: ${selectedMarketplaceName}.`);
  return summary.join(" ");
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
  const [marketplaceDraft, setMarketplaceDraft] = useState("");
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceName, setMarketplaceName] = useState("");
  const marketplace = useApiResource<MarketplaceResponse>(
    active && marketplaceQuery
      ? `/mcp/marketplace?query=${encodeURIComponent(marketplaceQuery)}&limit=12`
      : null,
    [active, marketplaceQuery],
  );
  const marketplaceDetail = useApiResource<MarketplaceDetailResponse>(
    active && marketplaceName
      ? `/mcp/marketplace/server?name=${encodeURIComponent(marketplaceName)}`
      : null,
    [active, marketplaceName],
  );
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
  const marketplaceServers = useMemo(
    () => normalizeMcpMarketplace(marketplace.data?.marketplace?.results),
    [marketplace.data?.marketplace?.results],
  );
  const selectedMarketplaceServer = normalizeMcpMarketplaceDetail(
    marketplaceDetail.data?.marketplace?.server,
    marketplaceDetail.data?.marketplace?.config,
  );
  const loading = status.loading || cached.loading;
  const staticError = status.error || cached.error;
  const liveStatus = mcpLiveStatus(
    bridge,
    asNumber(bridge?.discoveredTools, allTools.length),
    selectedName,
    marketplaceName,
  );
  const refresh = () => {
    status.reload();
    cached.reload();
    search.reload();
    selected.reload();
    marketplace.reload();
    marketplaceDetail.reload();
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setToolQuery(draftQuery.trim().slice(0, 256));
  };
  const submitMarketplaceSearch = (event: FormEvent) => {
    event.preventDefault();
    setMarketplaceName("");
    setMarketplaceQuery(marketplaceDraft.trim().slice(0, 128));
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
      setProbeNotice(
        `${ok ? "Probe passed" : "Probe failed"}: ${asString(result.probe?.detail, "The Eliza MCP service did not return a probe detail.")}`,
      );
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
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {liveStatus}
      </p>
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
          {configured ? (
            <button
              className="secondary-button"
              disabled={probing}
              onClick={() => void probe()}
              type="button"
            >
              {probing ? "Probing…" : "Probe"}
            </button>
          ) : null}
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
      {!loading ? (
        <>
          <CompactStatStrip
            label="MCP connection summary"
            stats={[
              {
                detail: bridge?.detail || "No MCP status returned.",
                label: "Eliza servers",
                tone: healthy ? "good" : "warn",
                value: `${asNumber(bridge?.connectedServers, 0)} / ${asNumber(bridge?.serverCount, 0)}`,
              },
              {
                detail: `Discovered ${displayTimestamp(bridge?.lastDiscoveryAt)}`,
                label: "Cached tools",
                value: asNumber(bridge?.discoveredTools, allTools.length),
              },
              {
                detail: bridge?.lastError || "No bridge error recorded.",
                label: "Last probe",
                tone: bridge?.lastError ? "warn" : "neutral",
                value: displayTimestamp(bridge?.lastProbeAt),
              },
            ]}
          />
          {!staticError && !configured ? (
            <Notice tone="warn">
              Add a server under <code>settings.mcp.servers</code> and restart
              the runtime. Eliza validates the configuration and owns the
              connection lifecycle.
            </Notice>
          ) : null}
          {probeNotice ? (
            <Notice
              tone={probeNotice.startsWith("Probe passed") ? "good" : "bad"}
            >
              {probeNotice}
            </Notice>
          ) : null}
          {servers.length ? (
            <details className="mcp-control-disclosure mcp-control-servers">
              <summary className="mcp-control-browser-header">
                <div>
                  <span className="eyebrow">Eliza connection registry</span>
                  <h3>Configured servers</h3>
                </div>
                <Badge tone="neutral">{servers.length} active</Badge>
              </summary>
              <div className="mcp-control-disclosure-body">
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
            </details>
          ) : null}
          <McpMarketplacePanel
            draft={marketplaceDraft}
            query={marketplaceQuery}
            selectedName={marketplaceName}
            servers={marketplaceServers}
            detail={selectedMarketplaceServer}
            loading={marketplace.loading}
            error={marketplace.error || marketplace.data?.marketplace?.error}
            detailLoading={marketplaceDetail.loading}
            detailError={
              marketplaceDetail.error ||
              marketplaceDetail.data?.marketplace?.error
            }
            onDraftChange={setMarketplaceDraft}
            onSubmit={submitMarketplaceSearch}
            onSelect={setMarketplaceName}
          />
          <McpCachedToolsPanel
            draft={draftQuery}
            query={toolQuery}
            tools={visibleTools}
            selectedName={selectedName}
            selectedTool={selectedTool}
            loading={search.loading}
            error={search.error}
            detailLoading={selected.loading}
            detailError={selected.error}
            detail={selected.data?.detail}
            onDraftChange={setDraftQuery}
            onSubmit={submitSearch}
            onClear={() => {
              setDraftQuery("");
              setToolQuery("");
            }}
            onSelect={setSelectedName}
          />
        </>
      ) : null}
    </section>
  );
}

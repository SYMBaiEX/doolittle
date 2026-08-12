import { type FormEvent, useMemo, useState } from "react";
import {
  asNumber,
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
import {
  type McpStatus,
  mcpLiveStatus,
  mcpStatusLabel,
  normalizeMcpMarketplace,
  normalizeMcpMarketplaceDetail,
  normalizeMcpServers,
  normalizeMcpTools,
} from "./mcp-control/model";
import "./mcp-control-panel.css";

export type {
  McpMarketplaceDetail,
  McpMarketplaceRequirement,
  McpMarketplaceSummary,
  McpToolSummary,
} from "./mcp-control/model";
export {
  mcpLiveStatus,
  mcpStatusLabel,
  normalizeMcpMarketplace,
  normalizeMcpMarketplaceDetail,
  normalizeMcpServers,
  normalizeMcpTools,
} from "./mcp-control/model";

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

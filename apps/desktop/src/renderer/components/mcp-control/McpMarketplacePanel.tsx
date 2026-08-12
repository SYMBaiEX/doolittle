import { Badge, EmptyBlock, LoadingBlock, Notice } from "../../lib";
import type {
  McpMarketplaceDetail,
  McpMarketplaceRequirement,
  McpMarketplaceSummary,
} from "../McpControlPanel";

export interface McpMarketplacePanelProps {
  draft: string;
  query: string;
  selectedName: string;
  servers: readonly McpMarketplaceSummary[];
  detail?: McpMarketplaceDetail;
  loading: boolean;
  error?: string;
  detailLoading: boolean;
  detailError?: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelect: (name: string) => void;
}

export function McpMarketplacePanel({
  draft,
  query,
  selectedName,
  servers,
  detail,
  loading,
  error,
  detailLoading,
  detailError,
  onDraftChange,
  onSubmit,
  onSelect,
}: McpMarketplacePanelProps) {
  return (
    <details className="mcp-control-disclosure mcp-control-marketplace">
      <summary className="mcp-control-browser-header">
        <div>
          <span className="eyebrow">Official MCP Registry via Eliza</span>
          <h3>Discover MCP servers</h3>
        </div>
        <Badge tone="neutral">Preview only</Badge>
      </summary>
      <div className="mcp-control-disclosure-body">
        <p className="mcp-control-marketplace-copy">
          Results and configuration previews come only from Eliza&apos;s MCP
          marketplace service. Doolittle does not install packages, execute
          commands, save credentials, or persist registry configurations from
          this screen.
        </p>
        <form className="mcp-control-search" onSubmit={onSubmit}>
          <input
            aria-label="Search official MCP marketplace"
            maxLength={128}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Search official MCP marketplace"
            type="search"
            value={draft}
          />
          <button className="secondary-button" type="submit">
            Search registry
          </button>
        </form>
        {loading ? (
          <LoadingBlock label="Searching the official MCP registry…" />
        ) : null}
        {error ? (
          <Notice tone="bad">
            Could not search the official MCP registry: {error}
          </Notice>
        ) : null}
        {query && !loading && !error && !servers.length ? (
          <EmptyBlock density="compact" title="No registry matches">
            Try a broader server name or capability.
          </EmptyBlock>
        ) : null}
        {servers.length ? (
          <div className="mcp-control-marketplace-grid">
            <ul
              aria-label="Official MCP marketplace servers"
              className="mcp-control-tool-list"
            >
              {servers.map((server) => (
                <li key={server.name}>
                  <button
                    aria-pressed={selectedName === server.name}
                    className={
                      selectedName === server.name ? "selected" : undefined
                    }
                    onClick={() => onSelect(server.name)}
                    type="button"
                  >
                    <code>{server.title}</code>
                    <span>{server.description}</span>
                    <small>
                      {server.connectionType} · v{server.version}
                      {server.isLatest ? " · latest" : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            <aside className="mcp-control-detail">
              {detailLoading ? (
                <LoadingBlock label="Reading registry definition…" />
              ) : null}
              {detailError ? (
                <Notice tone="bad">
                  Could not read this registry definition: {detailError}
                </Notice>
              ) : detail ? (
                <MarketplaceDetail detail={detail} />
              ) : !detailLoading ? (
                <p>
                  Select a registry definition to review its transport,
                  permissions, and generated Eliza configuration preview.
                </p>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function MarketplaceDetail({ detail }: { detail: McpMarketplaceDetail }) {
  return (
    <>
      <span className="eyebrow">Registry definition</span>
      <code>{detail.name}</code>
      <p>Version {detail.version}</p>
      {detail.repositoryUrl ? (
        <a href={detail.repositoryUrl} rel="noreferrer" target="_blank">
          Repository
        </a>
      ) : null}
      <dl className="mcp-control-requirements">
        <div>
          <dt>Transport</dt>
          <dd>{detail.transports.join(", ") || "Not declared"}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{formatMarketplaceRequirements(detail.environment)}</dd>
        </div>
        <div>
          <dt>Headers</dt>
          <dd>{formatMarketplaceRequirements(detail.headers)}</dd>
        </div>
      </dl>
      <strong>Generated config preview</strong>
      <pre>
        {detail.config
          ? JSON.stringify(detail.config, null, 2)
          : "No supported Eliza MCP configuration was generated."}
      </pre>
      <small>
        Review requirements, add any secret values outside this UI, then make an
        explicit settings change and restart the runtime. This preview never
        writes configuration.
      </small>
    </>
  );
}

function formatMarketplaceRequirements(
  requirements: readonly McpMarketplaceRequirement[],
) {
  if (!requirements.length) return "None declared";
  return requirements
    .map(
      (requirement) =>
        `${requirement.name}${requirement.required ? " (required)" : ""}${requirement.secret ? " (secret)" : ""}`,
    )
    .join(", ");
}

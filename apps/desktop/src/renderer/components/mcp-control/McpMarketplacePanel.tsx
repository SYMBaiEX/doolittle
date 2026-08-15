import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Badge, EmptyBlock, LoadingBlock, Notice } from "../../lib";
import {
  MCP_DETAIL_CLASS,
  MCP_DISCLOSURE_BODY_CLASS,
  MCP_DISCLOSURE_CLASS,
  MCP_SEARCH_CLASS,
  MCP_SUMMARY_CLASS,
  MCP_TOOL_BUTTON_CLASS,
  MCP_TOOL_BUTTON_SELECTED_CLASS,
  MCP_TOOL_LIST_CLASS,
  MCP_TWO_COLUMN_CLASS,
} from "./layout";
import type {
  McpMarketplaceDetail,
  McpMarketplaceRequirement,
  McpMarketplaceSummary,
} from "./model";

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
    <details
      className={`mcp-control-marketplace ${MCP_DISCLOSURE_CLASS}`}
      data-mcp-section="marketplace"
    >
      <summary className={MCP_SUMMARY_CLASS}>
        <div>
          <span className="eyebrow">Official MCP Registry via Eliza</span>
          <h3>Discover MCP servers</h3>
        </div>
        <Badge tone="neutral">Preview only</Badge>
        <span
          aria-hidden="true"
          className="font-[var(--font-mono)] text-[var(--muted)] group-open:hidden"
        >
          +
        </span>
        <span
          aria-hidden="true"
          className="hidden font-[var(--font-mono)] text-[var(--muted)] group-open:inline"
        >
          −
        </span>
      </summary>
      <div className={MCP_DISCLOSURE_BODY_CLASS}>
        <p className="m-0 max-w-[760px] text-xs leading-[1.5] text-[var(--text-soft)]">
          Results and configuration previews come only from Eliza&apos;s MCP
          marketplace service. Doolittle does not install packages, execute
          commands, save credentials, or persist registry configurations from
          this screen.
        </p>
        <form className={MCP_SEARCH_CLASS} onSubmit={onSubmit}>
          <Input
            aria-label="Search official MCP marketplace"
            maxLength={128}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Search official MCP marketplace"
            type="search"
            value={draft}
          />
          <Button size="sm" type="submit" variant="secondary">
            Search registry
          </Button>
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
          <div className={MCP_TWO_COLUMN_CLASS}>
            <ul
              aria-label="Official MCP marketplace servers"
              className={MCP_TOOL_LIST_CLASS}
            >
              {servers.map((server) => (
                <li key={server.name}>
                  <button
                    aria-pressed={selectedName === server.name}
                    className={`${MCP_TOOL_BUTTON_CLASS} ${selectedName === server.name ? MCP_TOOL_BUTTON_SELECTED_CLASS : ""}`}
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
            <aside className={MCP_DETAIL_CLASS}>
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
      <dl className="my-3 grid gap-[7px] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:text-[var(--text-soft)] [&_dt]:font-[var(--font-mono)] [&_dt]:text-[var(--muted)] [&_dt]:uppercase">
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-[11px] leading-[1.45]">
          <dt>Transport</dt>
          <dd>{detail.transports.join(", ") || "Not declared"}</dd>
        </div>
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-[11px] leading-[1.45]">
          <dt>Environment</dt>
          <dd>{formatMarketplaceRequirements(detail.environment)}</dd>
        </div>
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-[11px] leading-[1.45]">
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

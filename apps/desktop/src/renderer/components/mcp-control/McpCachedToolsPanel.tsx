import { Badge, EmptyBlock, LoadingBlock, Notice } from "../../lib";
import type { McpToolSummary } from "./model";

export interface McpCachedToolsPanelProps {
  draft: string;
  query: string;
  tools: readonly McpToolSummary[];
  selectedName: string;
  selectedTool?: McpToolSummary;
  loading: boolean;
  error?: string;
  detailLoading: boolean;
  detailError?: string;
  detail?: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onSelect: (name: string) => void;
}

export function McpCachedToolsPanel({
  draft,
  query,
  tools,
  selectedName,
  selectedTool,
  loading,
  error,
  detailLoading,
  detailError,
  detail,
  onDraftChange,
  onSubmit,
  onClear,
  onSelect,
}: McpCachedToolsPanelProps) {
  return (
    <details className="mcp-control-disclosure mcp-control-browser">
      <summary className="mcp-control-browser-header">
        <div>
          <span className="eyebrow">Read-only registry</span>
          <h3>Available MCP tools</h3>
        </div>
        <Badge tone="neutral">{tools.length} shown</Badge>
      </summary>
      <div className="mcp-control-disclosure-body">
        <form className="mcp-control-search" onSubmit={onSubmit}>
          <input
            aria-label="Search MCP tools"
            maxLength={256}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Search cached tools"
            type="search"
            value={draft}
          />
          <button
            aria-label="Search MCP tools"
            className="secondary-button"
            type="submit"
          >
            Search
          </button>
          {query ? (
            <button className="text-button" onClick={onClear} type="button">
              Clear
            </button>
          ) : null}
        </form>
        {loading ? <LoadingBlock label="Searching cached MCP tools…" /> : null}
        {error ? (
          <Notice tone="bad">Could not search cached MCP tools: {error}</Notice>
        ) : null}
        {!loading && !error && !tools.length ? (
          <EmptyBlock density="compact" title="No cached MCP tools">
            {query
              ? "Try a broader search."
              : "Probe a configured MCP connection to populate this registry."}
          </EmptyBlock>
        ) : null}
        {tools.length ? (
          <div className="mcp-control-tool-grid">
            <ul aria-label="MCP tools" className="mcp-control-tool-list">
              {tools.map((tool) => (
                <li key={tool.name}>
                  <button
                    aria-pressed={selectedName === tool.name}
                    className={
                      selectedName === tool.name ? "selected" : undefined
                    }
                    onClick={() => onSelect(tool.name)}
                    type="button"
                  >
                    <code>{tool.name}</code>
                    <span>{tool.description}</span>
                    <small>
                      {tool.inputCount} input{tool.inputCount === 1 ? "" : "s"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            <aside className="mcp-control-detail">
              {detailLoading ? (
                <LoadingBlock label="Reading tool schema…" />
              ) : null}
              {detailError ? (
                <Notice tone="bad">
                  Could not read this tool: {detailError}
                </Notice>
              ) : null}
              {!detailLoading &&
              !detailError &&
              selectedName &&
              selectedTool ? (
                <>
                  <span className="eyebrow">Tool details</span>
                  <code>{selectedTool.name}</code>
                  <p>{selectedTool.description}</p>
                  <small>
                    {selectedTool.inputCount} declared input
                    {selectedTool.inputCount === 1 ? "" : "s"}
                  </small>
                  {detail ? <pre>{detail}</pre> : null}
                </>
              ) : null}
              {!detailLoading &&
              !detailError &&
              !(selectedName && selectedTool) ? (
                <p>
                  Select a tool to inspect its cached definition. Execution
                  stays inside chat approval flows.
                </p>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </details>
  );
}

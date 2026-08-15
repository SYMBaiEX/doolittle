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
    <details
      className={`mcp-control-browser ${MCP_DISCLOSURE_CLASS}`}
      data-mcp-section="tools"
    >
      <summary className={MCP_SUMMARY_CLASS}>
        <div>
          <span className="eyebrow">Read-only registry</span>
          <h3>Available MCP tools</h3>
        </div>
        <Badge tone="neutral">{tools.length} shown</Badge>
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
        <form className={MCP_SEARCH_CLASS} onSubmit={onSubmit}>
          <Input
            aria-label="Search MCP tools"
            maxLength={256}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Search cached tools"
            type="search"
            value={draft}
          />
          <Button
            aria-label="Search MCP tools"
            size="sm"
            type="submit"
            variant="secondary"
          >
            Search
          </Button>
          {query ? (
            <Button onClick={onClear} size="sm" type="button" variant="ghost">
              Clear
            </Button>
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
          <div className={MCP_TWO_COLUMN_CLASS}>
            <ul aria-label="MCP tools" className={MCP_TOOL_LIST_CLASS}>
              {tools.map((tool) => (
                <li key={tool.name}>
                  <button
                    aria-pressed={selectedName === tool.name}
                    className={`${MCP_TOOL_BUTTON_CLASS} ${selectedName === tool.name ? MCP_TOOL_BUTTON_SELECTED_CLASS : ""}`}
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
            <aside className={MCP_DETAIL_CLASS}>
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

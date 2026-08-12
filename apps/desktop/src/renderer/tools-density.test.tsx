import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { McpControlPanelFallback, ToolsPage } from "./ToolsPage";

describe("ToolsPage density", () => {
  it("defers verbose integration diagnostics behind one disclosure", () => {
    const markup = renderToStaticMarkup(<ToolsPage active />);

    expect(markup).toContain("Integration bridges");
    expect(markup).toContain("MCP + ACP diagnostics");
    expect(markup).toContain('class="catalog-filter-bar"');
    expect(markup).toContain("Loading…");
    expect(markup).not.toContain("ACP bridge");
    expect(markup).not.toContain("MCP control plane");
  });

  it("provides a compact accessible boundary while MCP code loads", () => {
    const markup = renderToStaticMarkup(<McpControlPanelFallback />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('class="tools-integrations__loading-title"');
    expect(markup).toContain("Loading MCP workspace…");
    expect(markup).toContain("Server and tool reads begin");
  });
});

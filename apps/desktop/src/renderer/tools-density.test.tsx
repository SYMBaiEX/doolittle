import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { McpControlPanelFallback, ToolsPage } from "./ToolsPage";
import { TOOLS_FILTER_CONTAINER_CLASS } from "./tools/tools-layout";

describe("ToolsPage density", () => {
  it("defers verbose integration diagnostics behind one disclosure", () => {
    const markup = renderToStaticMarkup(<ToolsPage active />);

    expect(markup).toContain("Integration bridges");
    expect(markup).toContain("MCP + ACP diagnostics");
    expect(markup).toContain('class="catalog-filter-bar flex');
    expect(markup).toContain("Loading…");
    expect(markup).not.toContain("ACP bridge");
    expect(markup).not.toContain("MCP control plane");
  });

  it("provides a compact accessible boundary while MCP code loads", () => {
    const markup = renderToStaticMarkup(<McpControlPanelFallback />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("tools-integrations__loading-title");
    expect(markup).toContain("Loading MCP workspace…");
    expect(markup).toContain("Server and tool reads begin");
  });

  it("uses the Settings section presentation without route chrome when embedded", () => {
    const markup = renderToStaticMarkup(<ToolsPage active embedded />);

    expect(markup).toContain('class="settings-tools-section flex');
    expect(markup).toContain('class="settings-section-header"');
    expect(markup).toContain("Tool registry");
    expect(markup).not.toContain('class="page page-tools gap-3"');
  });

  it("reflows the loaded filter controls against available Settings content width", () => {
    const markup = renderToStaticMarkup(<ToolsPage active embedded />);

    expect(markup).toContain('class="@container/tools min-w-0');
    expect(markup).toContain('aria-label="Tool category"');
    expect(markup).toContain('aria-label="Eliza tool profile"');
    expect(TOOLS_FILTER_CONTAINER_CLASS).toContain(
      "@max-[640px]/tools:[&_.catalog-filter-bar]:flex-wrap",
    );
    expect(TOOLS_FILTER_CONTAINER_CLASS).toContain(
      "@max-[640px]/tools:[&_.catalog-filter-bar>label]:basis-full",
    );
    expect(TOOLS_FILTER_CONTAINER_CLASS).toContain(
      "@max-[640px]/tools:[&_.catalog-filter-bar>div]:flex-wrap",
    );
    expect(TOOLS_FILTER_CONTAINER_CLASS).toContain(
      "@max-[640px]/tools:[&_.catalog-filter-bar>div_select]:flex-[1_1_150px]",
    );
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolsPage } from "./ToolsPage";

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
});

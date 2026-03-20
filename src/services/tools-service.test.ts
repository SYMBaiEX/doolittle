import { describe, expect, it } from "bun:test";
import { ToolsService } from "./tools-service";

describe("ToolsService", () => {
  it("summarizes the registry and exposes lookup helpers", () => {
    const service = new ToolsService(() => ({
      mcpEnabled: true,
      discoveredMcpTools: 2,
      discoveredMcpToolNames: ["sum", "echo"],
    }));

    const summary = service.summary();
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.enabled).toBeGreaterThan(0);
    expect(summary.mcp.enabled).toBe(true);
    expect(summary.mcp.discoveredToolNames).toContain("sum");

    const browserTools = service.byCategory("documents");
    expect(browserTools.some((tool) => tool.id === "browser.status")).toBe(true);

    const bridge = service.get("mcp.bridge");
    expect(bridge?.enabled).toBe(true);
    expect(bridge?.description).toContain("2 discovered tool(s)");
  });
});

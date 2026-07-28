import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { McpService } from "./service";

const fixturePath = fileURLToPath(
  new URL("../../testing/mock-mcp.ts", import.meta.url),
);
const service = new McpService(() => ({
  serverCommand: `nub ${fixturePath}`,
  timeoutMs: 5_000,
}));

describe("McpService", () => {
  it("discovers structured tools", async () => {
    const result = await service.discoverTools();
    expect(result.ok).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.some((tool) => tool.name === "echo")).toBe(true);
    expect(service.status().discoveredTools).toBe(result.tools.length);
    expect(service.status().cachedToolNames).toContain("echo");
    expect(
      service.searchCachedTools("sum").some((tool) => tool.name === "sum"),
    ).toBe(true);
  });

  it("invokes a structured tool", async () => {
    const result = await service.invokeTool("sum", { a: 2, b: 5 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("7");
    expect(service.describeTool("sum")).toContain("MCP TOOL: sum");
    expect(service.describeCachedTools()).toContain("Sum two numbers.");
  });
});

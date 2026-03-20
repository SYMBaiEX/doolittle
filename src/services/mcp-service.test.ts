import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { McpService } from "./mcp-service";

const fixturePath = join(import.meta.dir, "..", "testing", "mock-mcp.ts");
const service = new McpService(() => ({
  serverCommand: `bun run ${fixturePath}`,
  timeoutMs: 5_000,
}));

describe("McpService", () => {
  beforeAll(() => {
    process.env.BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD = "1";
  });

  afterAll(() => {
    delete process.env.BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD;
  });

  it("discovers structured tools", async () => {
    const result = await service.discoverTools();
    expect(result.ok).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.some((tool) => tool.name === "echo")).toBe(true);
    expect(service.status().discoveredTools).toBe(result.tools.length);
    expect(service.status().cachedToolNames).toContain("echo");
  });

  it("invokes a structured tool", async () => {
    const result = await service.invokeTool("sum", { a: 2, b: 5 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("7");
    expect(service.describeTool("sum")).toContain("MCP TOOL: sum");
  });
});

import { describe, expect, it } from "bun:test";
import { createMcpPlugin } from ".";

interface McpTestService {
  status(): {
    enabled: boolean;
    detail: string;
    timeoutMs: number;
    discoveredTools: number;
    cachedToolNames: string[];
  };
  probe(): Promise<{ ok: boolean; detail: string }>;
  discoverTools(): Promise<{ ok: boolean; tools: unknown[]; detail: string }>;
  invoke(input: string): Promise<{ ok: boolean; output: string }>;
  invokeTool(
    name: string,
    input?: Record<string, unknown>,
  ): Promise<{ ok: boolean; tool: string; output: string }>;
  getCachedTools(): unknown[];
  searchCachedTools(query: string): unknown[];
  describeCachedTools(limit?: number): string;
  describeTool(name: string): string;
}

describe("createMcpPlugin", () => {
  it("creates plugin descriptor and forwards MCP operations", async () => {
    const calls: string[] = [];
    const plugin = createMcpPlugin({
      mcp: {
        status() {
          calls.push("status");
          return {
            enabled: true,
            detail: "ready",
            timeoutMs: 250,
            discoveredTools: 2,
            cachedToolNames: ["read", "write"],
          };
        },
        probe() {
          calls.push("probe");
          return Promise.resolve({ ok: true, detail: "connected" });
        },
        discoverTools() {
          calls.push("discoverTools");
          return Promise.resolve({ ok: true, tools: [], detail: "tools" });
        },
        invoke(input: string) {
          calls.push(`invoke:${input}`);
          return Promise.resolve({ ok: true, output: `out:${input}` });
        },
        invokeTool(name: string) {
          calls.push(`invokeTool:${name}`);
          return Promise.resolve({ ok: true, tool: name, output: "{}" });
        },
        getCachedTools() {
          calls.push("getCachedTools");
          return [];
        },
        searchCachedTools(query: string) {
          calls.push(`search:${query}`);
          return [];
        },
        describeCachedTools(limit = 20) {
          calls.push(`describe:${limit}`);
          return "cached";
        },
        describeTool(name: string) {
          calls.push(`describeTool:${name}`);
          return `tool:${name}`;
        },
      },
    });

    const mcpServiceClass = plugin.services?.[0];
    const service = (await mcpServiceClass?.start({} as never)) as
      | McpTestService
      | undefined;

    expect(plugin.name).toBe("mcp");
    expect(plugin.services).toHaveLength(1);
    expect(service?.status()).toEqual({
      enabled: true,
      detail: "ready",
      timeoutMs: 250,
      discoveredTools: 2,
      cachedToolNames: ["read", "write"],
    });
    expect(await service?.probe()).toEqual({ ok: true, detail: "connected" });
    expect(await service?.discoverTools()).toEqual({
      ok: true,
      tools: [],
      detail: "tools",
    });
    expect(await service?.invoke("ping")).toEqual({
      ok: true,
      output: "out:ping",
    });
    expect(await service?.invokeTool("echo", { payload: "v" })).toEqual({
      ok: true,
      tool: "echo",
      output: "{}",
    });
    expect(service?.getCachedTools()).toEqual([]);
    expect(service?.searchCachedTools("foo")).toEqual([]);
    expect(service?.describeCachedTools()).toBe("cached");
    expect(service?.describeTool("alpha")).toBe("tool:alpha");
    expect(calls).toEqual([
      "status",
      "probe",
      "discoverTools",
      "invoke:ping",
      "invokeTool:echo",
      "getCachedTools",
      "search:foo",
      "describe:20",
      "describeTool:alpha",
    ]);
  });

  it("exposes static service metadata", async () => {
    const plugin = createMcpPlugin({
      mcp: {
        status: () => ({
          enabled: false,
          detail: "off",
          timeoutMs: 10,
          discoveredTools: 0,
          cachedToolNames: [],
        }),
        probe: async () => ({ ok: false, detail: "down" }),
        discoverTools: async () => ({ ok: false, tools: [], detail: "down" }),
        invoke: async () => ({ ok: false, output: "" }),
        invokeTool: async (name, input) => ({
          ok: false,
          tool: name,
          output: JSON.stringify(input),
        }),
        getCachedTools: () => [],
        searchCachedTools: () => [],
        describeCachedTools: () => "",
        describeTool: () => "",
      },
    });
    const serviceClass = plugin.services?.[0];
    expect(serviceClass?.serviceType).toBe("mcp");
    expect(
      (await serviceClass?.start?.({} as never)) as McpTestService | undefined,
    ).toBeDefined();
  });
});

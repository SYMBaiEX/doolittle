import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleMcpRoutes } from "./mcp";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      mcp: {
        status: () => ({ connected: true }),
        probe: async () => ({ ok: true }),
        discoverTools: async () => [{ name: "discover:tool" }],
        getCachedTools: () => [{ name: "tool-1" }],
        searchCachedTools: (query: string) => [{ name: `search:${query}` }],
        describeCachedTools: (limit: number) => `cached:${limit}`,
        describeTool: (name: string) => `tool:${name}`,
        invoke: async (input: string) => ({ input, type: "invoke" }),
        invokeTool: async (tool: string, input: Record<string, unknown>) => ({
          tool,
          input,
          type: "tool",
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleMcpRoutes", () => {
  it("returns MCP status, discovery, cached, and describe payloads", async () => {
    const context = createContext();
    const status = await handleMcpRoutes(
      context,
      new Request("http://localhost/mcp/status"),
      new URL("http://localhost/mcp/status"),
    );
    const tools = await handleMcpRoutes(
      context,
      new Request("http://localhost/mcp/tools"),
      new URL("http://localhost/mcp/tools"),
    );
    const describe = await handleMcpRoutes(
      context,
      new Request("http://localhost/mcp/cached/describe?limit=7"),
      new URL("http://localhost/mcp/cached/describe?limit=7"),
    );

    await expect(status?.json()).resolves.toEqual({
      mcp: { connected: true },
    });
    await expect(tools?.json()).resolves.toEqual({
      discovery: [{ name: "discover:tool" }],
    });
    await expect(describe?.json()).resolves.toEqual({
      detail: "cached:7",
    });
  });

  it("validates search, tool detail, and invoke inputs", async () => {
    const missingSearch = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/mcp/cached/search"),
      new URL("http://localhost/mcp/cached/search"),
    );
    const missingTool = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/mcp/tool"),
      new URL("http://localhost/mcp/tool"),
    );
    const missingInvoke = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/mcp/invoke", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/mcp/invoke"),
    );

    expect(missingSearch?.status).toBe(400);
    await expect(missingSearch?.json()).resolves.toEqual({
      error: "query is required",
    });
    expect(missingTool?.status).toBe(400);
    await expect(missingTool?.json()).resolves.toEqual({
      error: "name is required",
    });
    expect(missingInvoke?.status).toBe(400);
    await expect(missingInvoke?.json()).resolves.toEqual({
      error: "input is required",
    });
  });

  it("returns cached detail and invoke results", async () => {
    const context = createContext();
    const detail = await handleMcpRoutes(
      context,
      new Request("http://localhost/mcp/tool?name=tool-1"),
      new URL("http://localhost/mcp/tool?name=tool-1"),
    );
    const invokeTool = await handleMcpRoutes(
      context,
      new Request("http://localhost/mcp/invoke-tool", {
        method: "POST",
        body: JSON.stringify({ tool: "tool-1", input: { value: 1 } }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/mcp/invoke-tool"),
    );

    await expect(detail?.json()).resolves.toEqual({
      tool: { name: "tool-1" },
      detail: "tool:tool-1",
    });
    await expect(invokeTool?.json()).resolves.toEqual({
      result: { tool: "tool-1", input: { value: 1 }, type: "tool" },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/not-mcp"),
      new URL("http://localhost/not-mcp"),
    );

    expect(response).toBeNull();
  });
});

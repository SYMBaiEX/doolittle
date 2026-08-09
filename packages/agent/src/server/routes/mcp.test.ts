import { DOOLITTLE_MCP_SERVICE } from "@doolittle/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleMcpRoutes } from "./mcp";

vi.mock("@/runtime/native/service-bridge/tooling", () => ({
  describeEffectiveCachedMcpTools: (_runtime: unknown, limit: number) =>
    `cached:${limit}`,
  describeEffectiveMcpTool: (_runtime: unknown, name: string) => `tool:${name}`,
  discoverEffectiveMcpTools: async () => [{ name: "discover:tool" }],
  getEffectiveCachedMcpTools: () => [{ name: "tool-1" }],
  getEffectiveMcpMarketplaceServer: async (name: string) => ({
    available: true,
    name,
    source: "@elizaos/agent/services/mcp-marketplace",
    server: { name, version: "1.0.0" },
    config: { type: "streamable-http", url: "https://mcp.example.test" },
  }),
  getEffectiveMcpStatus: () => ({ connected: true }),
  invokeEffectiveMcp: async (_runtime: unknown, input: string) => ({
    input,
    type: "invoke",
  }),
  invokeEffectiveMcpTool: async (
    _runtime: unknown,
    tool: string,
    input: Record<string, unknown>,
  ) => ({ tool, input, type: "tool" }),
  probeEffectiveMcp: async () => ({ ok: true }),
  searchEffectiveCachedMcpTools: (_runtime: unknown, query: string) => [
    { name: `search:${query}` },
  ],
  searchEffectiveMcpMarketplace: async (query: string, limit: number) => ({
    available: true,
    source: "@elizaos/agent/services/mcp-marketplace",
    query,
    limit,
    results: [{ name: "io.example/research" }],
  }),
}));

function createContext(): AppContext {
  const mcp = {
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
  };
  return {
    runtime: {
      getService: (name: string) =>
        name === DOOLITTLE_MCP_SERVICE ? mcp : null,
    },
    services: {
      mcp,
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
    const unsafeMarketplaceQuery = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/mcp/marketplace?query=%20"),
      new URL("http://localhost/mcp/marketplace?query=%20"),
    );
    const unsafeMarketplaceName = await handleMcpRoutes(
      createContext(),
      new Request(
        "http://localhost/mcp/marketplace/server?name=https%3A%2F%2Fevil.test",
      ),
      new URL(
        "http://localhost/mcp/marketplace/server?name=https%3A%2F%2Fevil.test",
      ),
    );
    const unsafeMarketplaceLimit = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/mcp/marketplace?query=research&limit=99"),
      new URL("http://localhost/mcp/marketplace?query=research&limit=99"),
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
    expect(unsafeMarketplaceQuery?.status).toBe(400);
    await expect(unsafeMarketplaceQuery?.json()).resolves.toEqual({
      error: "a bounded marketplace query is required",
    });
    expect(unsafeMarketplaceName?.status).toBe(400);
    await expect(unsafeMarketplaceName?.json()).resolves.toEqual({
      error: "a valid marketplace server name is required",
    });
    expect(unsafeMarketplaceLimit?.status).toBe(400);
    await expect(unsafeMarketplaceLimit?.json()).resolves.toEqual({
      error: "marketplace limit must be between 1 and 20",
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

  it("uses only bounded official marketplace search and definition projections", async () => {
    const search = await handleMcpRoutes(
      createContext(),
      new Request("http://localhost/mcp/marketplace?query=research&limit=12"),
      new URL("http://localhost/mcp/marketplace?query=research&limit=12"),
    );
    const detail = await handleMcpRoutes(
      createContext(),
      new Request(
        "http://localhost/mcp/marketplace/server?name=io.example%2Fresearch",
      ),
      new URL(
        "http://localhost/mcp/marketplace/server?name=io.example%2Fresearch",
      ),
    );

    await expect(search?.json()).resolves.toEqual({
      marketplace: {
        available: true,
        source: "@elizaos/agent/services/mcp-marketplace",
        query: "research",
        limit: 12,
        results: [{ name: "io.example/research" }],
      },
    });
    await expect(detail?.json()).resolves.toEqual({
      marketplace: {
        available: true,
        name: "io.example/research",
        source: "@elizaos/agent/services/mcp-marketplace",
        server: { name: "io.example/research", version: "1.0.0" },
        config: {
          type: "streamable-http",
          url: "https://mcp.example.test",
        },
      },
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

import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleToolingCommand } from "./tooling-commands";

function createContext(): AgentExecutionContext {
  return {
    runtime: {},
    services: {
      tools: {
        byCategory: (category: string) => [
          {
            id: `category:${category}`,
            enabled: true,
            description: "category tool",
          },
        ],
        get: (id: string) => ({ id, enabled: true, description: "detail" }),
        list: () => [
          {
            id: "tool-1",
            enabled: true,
            category: "browser",
            description: "fetch pages",
          },
        ],
        search: (query: string) => [
          {
            id: `search:${query}`,
            enabled: true,
            category: "browser",
            transport: "service",
            description: "matched",
          },
        ],
        summary: () => ({
          transports: [{ transport: "service", enabled: 1, total: 1 }],
        }),
      },
      mcp: {
        describeCachedTools: (limit: number) => `cached:${limit}`,
        describeTool: (name: string) => `tool:${name}`,
        discoverTools: async () => [{ name: "search" }],
        invoke: async (input: string) => ({ invoked: input }),
        invokeTool: async (name: string, input: Record<string, unknown>) => ({
          name,
          input,
        }),
        probe: async () => ({ ok: true }),
        searchCachedTools: (query: string) => [{ id: query }],
      },
      acp: {
        describeTool: (name: string) => `acp:${name}`,
        editorSummary: () => ({ editor: true }),
        exportBundle: (label: string) => ({ label }),
        importBundle: (input: string) => ({ input }),
        invoke: async (input: string) => ({ invoked: input }),
        invokeTool: async (name: string, input: Record<string, unknown>) => ({
          name,
          input,
        }),
        packageMetadata: () => ({ package: true }),
        probe: async () => ({ ok: true }),
        publishRegistry: () => ({ published: true }),
        registry: () => ({ registry: true }),
        searchTools: (query: string) => [{ id: query }],
        sessionSummary: () => ({ sessions: [] }),
        status: () => ({ ready: true }),
        tools: () => [{ id: "tool-1" }],
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("tooling command router", () => {
  it("renders tool listings and search results", async () => {
    const context = createContext();
    const listed = await handleToolingCommand("/tools", context);
    const searched = await handleToolingCommand(
      "/tools search browser",
      context,
    );

    expect(listed).toContain("tool-1");
    expect(searched).toContain("search:browser");
  });

  it("dispatches mcp and acp call commands", async () => {
    const context = createContext();
    const mcp = await handleToolingCommand(
      '/mcp call search :: {"q":"docs"}',
      context,
    );
    const acp = await handleToolingCommand(
      '/acp call publish :: {"draft":true}',
      context,
    );

    expect(mcp).toContain('"name": "search"');
    expect(acp).toContain('"name": "publish"');
  });

  it("returns usage for missing query-based tool and acp commands", async () => {
    const context = createContext();
    const search = await handleToolingCommand("/tools search ", context);
    const mcpMarketplace = await handleToolingCommand(
      "/mcp marketplace search",
      context,
    );
    const describe = await handleToolingCommand("/acp describe ", context);

    expect(search).toBe("Usage: /tools search <query>");
    expect(mcpMarketplace).toBe("Usage: /mcp marketplace search <query>");
    expect(describe).toBe("Usage: /acp describe <tool-name>");
  });
});

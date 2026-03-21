import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos-official/compat";

export interface McpPluginOptions {
  mcp: {
    status(): unknown;
    probe(): Promise<unknown>;
    discoverTools(): Promise<unknown>;
    invoke(input: string): Promise<unknown>;
    invokeTool(name: string, input: Record<string, unknown>): Promise<unknown>;
    getCachedTools(): unknown[];
    searchCachedTools(query: string): unknown[];
    describeCachedTools(limit?: number): string;
    describeTool(name: string): string;
  };
}

export function createMcpPlugin(options: McpPluginOptions): Plugin {
  const McpService = createServiceAdapter({
    serviceType: "mcp",
    capabilityDescription:
      "Official-style MCP service backed by Eliza Agent tool discovery and invocation.",
    create: async () => ({
      status() {
        return options.mcp.status();
      },
      probe() {
        return options.mcp.probe();
      },
      discoverTools() {
        return options.mcp.discoverTools();
      },
      invoke(input: string) {
        return options.mcp.invoke(input);
      },
      invokeTool(name: string, input: Record<string, unknown>) {
        return options.mcp.invokeTool(name, input);
      },
      getCachedTools() {
        return options.mcp.getCachedTools();
      },
      searchCachedTools(query: string) {
        return options.mcp.searchCachedTools(query);
      },
      describeCachedTools(limit = 20) {
        return options.mcp.describeCachedTools(limit);
      },
      describeTool(name: string) {
        return options.mcp.describeTool(name);
      },
    }),
  });

  return createServicePlugin(
    "mcp",
    "Official-style MCP plugin layered onto Eliza Agent MCP discovery and invocation.",
    McpService,
  );
}

export default createMcpPlugin;

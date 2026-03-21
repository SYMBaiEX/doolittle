import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos-official/compat";

export interface McpPluginOptions {
  mcp: {
    discoverTools(): Promise<unknown[]> | unknown[];
    invokeTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
    status(): Promise<unknown> | unknown;
  };
}

export function createMcpPlugin(options: McpPluginOptions): Plugin {
  const McpService = createServiceAdapter({
    serviceType: "mcp",
    capabilityDescription:
      "Official-style MCP bridge service for Model Context Protocol servers.",
    create: async () => ({
      discoverTools() {
        return options.mcp.discoverTools();
      },
      invokeTool(name: string, args?: Record<string, unknown>) {
        return options.mcp.invokeTool(name, args);
      },
      status() {
        return options.mcp.status();
      },
    }),
  });

  return createServicePlugin(
    "mcp",
    "Official-style MCP plugin for Model Context Protocol servers.",
    McpService,
  );
}

export default createMcpPlugin;

import type { Plugin } from "@elizaos/core";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredIntegrationPlugins({
  services,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const { createMcpPlugin } = await import("@elizaos/plugin-mcp");

  return [
    createMcpPlugin({
      mcp: {
        status: () => services.mcp.status(),
        probe: () => services.mcp.probe(),
        discoverTools: () => services.mcp.discoverTools(),
        invoke: (input) => services.mcp.invoke(input),
        invokeTool: (name, input) => services.mcp.invokeTool(name, input),
        getCachedTools: () => services.mcp.getCachedTools(),
        searchCachedTools: (query) => services.mcp.searchCachedTools(query),
        describeCachedTools: (limit = 20) =>
          services.mcp.describeCachedTools(limit),
        describeTool: (name) => services.mcp.describeTool(name),
      },
    }),
  ];
}

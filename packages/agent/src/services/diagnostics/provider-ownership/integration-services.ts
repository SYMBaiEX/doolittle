import type { BrowserMcpServices } from "@/runtime/native/service-bridge/control-planes";
import type { EnvConfig } from "@/types";

export function buildBrowserMcpServices(config: EnvConfig): BrowserMcpServices {
  return {
    web: {
      status: async () => ({
        provider: config.browserProvider,
        ready: Boolean(config.browserCommand),
        mode: config.browserProvider === "lightpanda" ? "browser" : "fallback",
        captureMode:
          config.browserProvider === "lightpanda" ? "pixel" : "placeholder",
        captureReady:
          config.browserProvider === "lightpanda" &&
          Boolean(config.browserCommand),
        detail:
          config.browserProvider === "lightpanda"
            ? `Lightpanda is configured as the default browser backend via ${config.browserCommand}.`
            : "Basic HTTP fetch mode is configured as the browser fallback.",
        artifacts: {
          snapshot: Boolean(config.browserCommand),
          screenshot: Boolean(config.browserCommand),
          comparison: Boolean(config.browserCommand),
        },
      }),
    },
    mcp: {
      status: () => ({
        enabled: Boolean(config.mcpServerCommand),
        detail: config.mcpServerCommand
          ? `MCP bridge command configured: ${config.mcpServerCommand}`
          : "MCP_SERVER_COMMAND is not configured.",
        command: config.mcpServerCommand || undefined,
        timeoutMs: config.mcpTimeoutMs,
        discoveredTools: 0,
        cachedToolNames: [],
      }),
      getCachedTools: () => [],
    },
  };
}

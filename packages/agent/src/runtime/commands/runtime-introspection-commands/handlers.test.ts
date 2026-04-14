import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handlePluginRuntimeIntrospectionCommand } from "./plugin";
import { handleServiceRuntimeIntrospectionCommand } from "./service";

function createContext() {
  return {
    runtime: {},
    config: {
      elizaCloudApiKey: undefined,
      elizaCloudEnabled: false,
      useLinkedCodexAuth: true,
      useLinkedClaudeCodeAuth: false,
      openAiApiKey: "openai-test",
      anthropicApiKey: undefined,
      telegramBotToken: "telegram-test",
      discordBotToken: "",
    },
    services: {
      nativeOwnership: {
        controlPlane: () => ({
          serviceResolution: [{ service: "browser", source: "native" }],
          pluginManager: {
            summary: {
              total: 3,
              enabled: 2,
              official: 2,
              vendored: 1,
            },
          },
          identity: { source: "runtime" },
          transportControl: {
            messagingBridge: [{ platform: "telegram", live: true }],
            transportInventory: [
              { platform: "telegram", operational: true },
              { platform: "discord", operational: false },
            ],
            totals: {
              configured: 2,
              operationalTransports: 1,
              liveServices: 1,
            },
          },
        }),
      },
      web: {
        status: async () => ({ ready: true }),
      },
      mcp: {
        status: () => ({ ready: true }),
        getCachedTools: () => [{ name: "tool-a" }],
      },
      nativeRegistry: {
        browser: {},
        messaging: {},
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("runtime introspection command readouts", () => {
  it("renders a guided runtime plugin summary", async () => {
    const result = await handlePluginRuntimeIntrospectionCommand(
      "/runtime plugins",
      createContext(),
    );

    expect(result).toContain("Runtime Plugins");
    expect(result).toContain("Catalog:");
    expect(result).toContain("Plugin manager:");
    expect(result).toContain("Next:");
  });

  it("renders a guided runtime service summary", async () => {
    const result = await handleServiceRuntimeIntrospectionCommand(
      "/runtime services",
      createContext(),
    );

    expect(result).toContain("Runtime Services");
    expect(result).toContain("Integration:");
    expect(result).toContain("Messaging bridge:");
    expect(result).toContain("Next:");
  });
});

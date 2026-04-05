import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimeRoutes } from "@/server/routes/runtime/index";

function createContext() {
  return {
    config: {
      agentName: "Doolittle Test",
      mode: "api",
      offlineBootstrapMode: true,
      openAiApiKey: "",
      anthropicApiKey: "",
      telegramBotToken: "",
      elizaCloudApiKey: "",
      elizaCloudEnabled: false,
      useLinkedCodexAuth: false,
      useLinkedClaudeCodeAuth: false,
    },
    runtime: {},
    services: {
      settings: {
        get: () => ({
          model: {
            provider: "local",
            model: "gpt-test",
          },
        }),
      },
      startupState: {
        getSnapshot: () => ({
          phase: "ready",
        }),
      },
      gatewayConfig: {
        transports: [],
      },
      nativeRegistry: {
        browser: "plugin",
      },
      nativeOwnership: {
        controlPlane: () => ({
          transportControl: {
            transportInventory: [{ platform: "telegram", enabled: false }],
            totals: { enabled: 0, disabled: 1 },
            messagingBridge: { source: "runtime", available: true },
          },
          serviceResolution: { browser: "plugin" },
          pluginManager: { available: true },
          identity: { source: "runtime" },
        }),
      },
      agentSdk: {
        compatibility: async () => ({ ok: true }),
        searchRegistry: async (query: string) => ({ query, mode: "search" }),
        registry: async (refresh: boolean) => ({ refresh, mode: "registry" }),
      },
      ecosystem: {
        benchmarkPacks: () => ["pack-a"],
        distributionChannels: () => ["stable"],
        optionalSkillPacks: () => ["pack-optional"],
        modelingProfiles: () => ["profile-a"],
      },
      operator: {
        setupSummary: async () => ({ ok: true }),
      },
    },
  } as unknown as AppContext;
}

describe("handleRuntimeRoutes", () => {
  it("returns health status", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/health"),
      new URL("http://localhost/health"),
    );

    expect(response).not.toBeNull();
    await expect(response?.json()).resolves.toEqual({
      status: "ok",
      name: "Doolittle Test",
      mode: "api",
    });
  });

  it("returns runtime status with ownership details", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/runtime/status"),
      new URL("http://localhost/runtime/status"),
    );

    const body = (await response?.json()) as {
      provider: string;
      model: string;
      native: {
        ownership: {
          serviceResolution: Record<string, string>;
        };
      };
    };

    expect(body.provider).toBe("local");
    expect(body.model).toBe("gpt-test");
    expect(body.native.ownership.serviceResolution).toEqual({
      browser: "plugin",
    });
  });

  it("rejects invalid account providers", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/accounts/use", {
        method: "POST",
        body: JSON.stringify({ provider: "nope" }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/accounts/use"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "provider must be elizacloud, codex, or claude-code",
    });
  });

  it("delegates runtime registry search", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/runtime/registry?query=browser"),
      new URL("http://localhost/runtime/registry?query=browser"),
    );

    await expect(response?.json()).resolves.toEqual({
      query: "browser",
      mode: "search",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/not-runtime"),
      new URL("http://localhost/not-runtime"),
    );

    expect(response).toBeNull();
  });
});

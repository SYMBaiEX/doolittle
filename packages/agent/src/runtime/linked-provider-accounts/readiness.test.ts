import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";

let snapshotCalls = 0;
let providerCredentialsCalls = 0;

const snapshot = {
  codex: {
    nativeReady: true,
    reusable: true,
    fallbackReady: false,
    detail: "codex ready",
  },
  claudeCode: {
    nativeReady: false,
    reusable: false,
    fallbackReady: true,
    detail: "claude fallback",
  },
  elizaCloud: {
    nativeReady: false,
    reusable: false,
    fallbackReady: false,
    detail: "cloud not ready",
  },
};

function installReadinessMocks() {
  vi.doMock("@/runtime/native/account-auth", () => ({
    getLinkedProviderConnectAdvice: (provider: string) => ({
      provider,
      detail: "advice",
      preferredAction: "connect",
      primaryCommand: `/accounts connect ${provider}`,
    }),
    refreshLinkedCodexCredentials: async () => undefined,
    refreshLinkedClaudeCodeCredentials: async () => undefined,
    resolveLinkedProviderCredentials: async () => {
      providerCredentialsCalls += 1;
      return {
        source: "native",
        authMode: "native",
        apiKey: "k",
      } as never;
    },
  }));

  vi.doMock("@/runtime/native/provider-accounts", () => ({
    getRuntimeProviderAccountsSnapshot: () => {
      snapshotCalls += 1;
      return snapshot;
    },
  }));

  vi.doMock("@elizaos/agent", () => ({
    validateCloudBaseUrl: async () => null,
  }));
}

async function loadReadinessModule() {
  return import("./readiness");
}

describe("linked-provider-accounts readiness helpers", () => {
  beforeEach(() => {
    vi.stubEnv("ELIZAOS_CLOUD_BASE_URL", "");
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    snapshotCalls = 0;
    providerCredentialsCalls = 0;
    snapshot.codex.nativeReady = true;
    snapshot.codex.reusable = true;
    snapshot.codex.fallbackReady = false;
    snapshot.claudeCode.nativeReady = false;
    snapshot.claudeCode.reusable = false;
    snapshot.claudeCode.fallbackReady = true;
    snapshot.elizaCloud.nativeReady = false;
    snapshot.elizaCloud.reusable = false;
    snapshot.elizaCloud.fallbackReady = false;
    installReadinessMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("describes cloud doctor state from linked credentials and settings", async () => {
    const { describeElizaCloudDoctorState } = await loadReadinessModule();
    const context = {
      runtime: {},
      services: {
        settings: {
          get: () => ({
            model: { provider: "codex", model: "", baseUrl: "" },
          }),
        },
      },
      config: {
        elizaCloudBaseUrl: "https://managed.cloud.test",
      },
    } as unknown as AgentExecutionContext;

    const state = await describeElizaCloudDoctorState(context);

    expect(providerCredentialsCalls).toBe(1);
    expect(state.configuredBaseUrl).toBe("https://managed.cloud.test");
    expect(state.normalizedBaseUrl).toContain("https://managed.cloud.test");
    expect(state.baseUrlValidation).toBeNull();
    expect(state.credentialSource).toBe("native");
    expect(state.authMode).toBe("native");
    expect(state.hasApiKey).toBe(true);
  });

  it("returns cached readiness result when provider is checked twice in short time", async () => {
    const { getProviderReadinessMessage } = await loadReadinessModule();
    const runtime = {};
    const context = {
      runtime,
      services: {
        settings: {
          get: () => ({
            model: { provider: "openai", model: "", baseUrl: "" },
          }),
        },
      },
      config: {
        openAiApiKey: "",
        offlineBootstrapMode: false,
      },
    } as unknown as AgentExecutionContext;

    const first = await getProviderReadinessMessage(context, "openai");
    const second = await getProviderReadinessMessage(context, "openai");

    expect(snapshotCalls).toBe(1);
    expect(first).toContain("Run `/accounts use codex`");
    expect(second).toBe(first);
  });

  it("caches anthropic readiness result on the reusable-link path", async () => {
    snapshot.claudeCode.nativeReady = true;
    const { getProviderReadinessMessage } = await loadReadinessModule();
    const runtime = {};
    const context = {
      runtime,
      services: {
        settings: {
          get: () => ({
            model: { provider: "anthropic", model: "", baseUrl: "" },
          }),
        },
      },
      config: {
        anthropicApiKey: "",
      },
    } as unknown as AgentExecutionContext;

    const first = await getProviderReadinessMessage(context, "anthropic");
    const second = await getProviderReadinessMessage(context, "anthropic");

    expect(snapshotCalls).toBe(1);
    expect(first).toContain("Run `/accounts use claude-code`");
    expect(second).toBe(first);
  });

  it("allows Claude CLI fallback without blocking on OAuth refresh", async () => {
    const { getProviderReadinessMessage } = await loadReadinessModule();
    const context = {
      runtime: {},
      services: {
        settings: {
          get: () => ({
            model: { provider: "claude-code", model: "", baseUrl: "" },
          }),
        },
      },
      config: {
        claudeCodeCliFallback: true,
      },
    } as unknown as AgentExecutionContext;

    const message = await getProviderReadinessMessage(context, "claude-code");

    expect(message).toBeUndefined();
    expect(providerCredentialsCalls).toBe(0);
  });

  it("returns a fast readiness message when local Ollama is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      return Promise.reject(new Error("connection refused"));
    }) as unknown as typeof globalThis.fetch;

    try {
      const { getProviderReadinessMessage } = await loadReadinessModule();
      const runtime = {};
      const context = {
        runtime,
        services: {
          settings: {
            get: () => ({
              model: {
                provider: "ollama",
                model: "granite4.1:3b",
                baseUrl: "http://localhost:11434/api",
              },
            }),
          },
        },
        config: {
          ollamaApiEndpoint: "http://localhost:11434/api",
        },
      } as unknown as AgentExecutionContext;

      const first = await getProviderReadinessMessage(context, "ollama");
      const second = await getProviderReadinessMessage(context, "ollama");

      expect(first).toContain("local API is not responding");
      expect(second).toBe(first);
      expect(fetchCalls).toBe(1);
      expect(snapshotCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports a selected Ollama model that is not installed", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "qwen3:1.7b" }],
          }),
          { status: 200 },
        ),
      )) as unknown as typeof globalThis.fetch;

    try {
      const { getProviderReadinessMessage } = await loadReadinessModule();
      const context = {
        runtime: {},
        services: {
          settings: {
            get: () => ({
              model: {
                provider: "ollama",
                model: "granite4.1:3b",
                baseUrl: "http://localhost:11434/api",
              },
            }),
          },
        },
        config: {
          ollamaApiEndpoint: "http://localhost:11434/api",
        },
      } as unknown as AgentExecutionContext;

      const message = await getProviderReadinessMessage(context, "ollama");

      expect(message).toContain("granite4.1:3b is not installed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

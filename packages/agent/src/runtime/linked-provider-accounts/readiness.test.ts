import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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
  mock.module("@/runtime/native/account-auth", () => ({
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
    getLinkedProviderAccountsSnapshot: () => {
      snapshotCalls += 1;
      return snapshot;
    },
  }));

  mock.module("@elizaos/agent/cloud/validate-url", () => ({
    validateCloudBaseUrl: async () => null,
  }));
}

async function loadReadinessModule() {
  return import(`./readiness?readiness-test=${Date.now()}-${Math.random()}`);
}

describe("linked-provider-accounts readiness helpers", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
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
    mock.restore();
    mock.clearAllMocks();
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
});

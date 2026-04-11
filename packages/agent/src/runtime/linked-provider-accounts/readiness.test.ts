import { describe, expect, it, mock } from "bun:test";
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

mock.module("@/runtime/native/account-auth/index", () => ({
  getLinkedProviderConnectAdvice: (provider: string) => ({
    provider,
    detail: "advice",
    preferredAction: "connect",
    primaryCommand: `/accounts connect ${provider}`,
  }),
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

const { describeElizaCloudDoctorState, getProviderReadinessMessage } =
  await import("./readiness");

describe("linked-provider-accounts readiness helpers", () => {
  it("describes cloud doctor state from linked credentials and settings", async () => {
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
    snapshotCalls = 0;
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
});

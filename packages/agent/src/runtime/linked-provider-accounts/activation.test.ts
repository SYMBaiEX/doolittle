import { describe, expect, it, mock } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";

let snapshotCallCount = 0;

mock.module("@/runtime/native/account-auth/index", () => ({
  getLinkedProviderConnectAdvice: (provider: string) => ({
    provider,
    detail: "advice",
    preferredAction: "connect",
    primaryCommand: `/accounts connect ${provider}`,
  }),
  resolveLinkedProviderCredentials: async () => ({ apiKey: "k" }),
  refreshLinkedCodexCredentials: async () => undefined,
  refreshLinkedClaudeCodeCredentials: async () => undefined,
  getLinkedProviderAccountsSnapshot: () => {
    snapshotCallCount += 1;
    return {
      codex: {
        nativeReady: true,
        reusable: true,
        fallbackReady: false,
        detail: "",
      },
      claudeCode: {
        nativeReady: false,
        reusable: false,
        fallbackReady: false,
        detail: "",
      },
      elizaCloud: {
        nativeReady: false,
        reusable: false,
        fallbackReady: false,
        detail: "",
      },
    };
  },
}));

const { activateLinkedProvider } = await import("./activation");

describe("activateLinkedProvider", () => {
  it("updates model settings and returns refreshed linked accounts", () => {
    const runtimeSettings = new Map<string, string>();
    const settingsStore = {
      model: {
        provider: "local",
        model: "",
        baseUrl: "",
      },
    };
    const context = {
      runtime: {
        setSetting: (key: string, value: string) =>
          runtimeSettings.set(key, value),
        getSetting: (key: string) => runtimeSettings.get(key),
      },
      config: {
        elizaCloudLargeModel: "ec-large",
        elizaCloudSmallModel: "ec-small",
      },
      services: {
        settings: {
          get: () => ({
            model: { ...settingsStore.model },
          }),
          set: (path: string, value: string) => {
            if (path === "model.provider") {
              settingsStore.model.provider = value;
            }
            if (path === "model.model") {
              settingsStore.model.model = value;
            }
            if (path === "model.baseUrl") {
              settingsStore.model.baseUrl = value;
            }
          },
        },
      },
    } as unknown as AgentExecutionContext;

    const result = activateLinkedProvider(context, "claude-code");

    expect(result.provider).toBe("claude-code");
    expect(result.model).toBe("claude-sonnet-4.6");
    expect(result.baseUrl).toBe("");
    expect(snapshotCallCount).toBe(1);
  });
});

import { describe, expect, it, mock } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";

const refreshCalls: string[] = [];
const resolveCalls: string[] = [];

mock.module("@/runtime/native/account-auth/index", () => ({
  getLinkedProviderAccountsSnapshot: () => ({
    codex: {
      provider: "codex",
      available: true,
      nativeReady: true,
      reusable: true,
      fallbackReady: false,
      detail: "ready",
    },
    claudeCode: {
      provider: "claude-code",
      available: true,
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
      detail: "not ready",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: true,
      nativeReady: false,
      reusable: false,
      fallbackReady: false,
      detail: "not ready",
    },
  }),
  getLinkedProviderConnectAdvice: (provider: string) => ({
    provider,
    detail: "advice",
    preferredAction: "connect",
    primaryCommand: `/accounts connect ${provider}`,
  }),
  resolveLinkedProviderCredentials: async (provider: string) => {
    resolveCalls.push(provider);
    return { provider };
  },
  refreshLinkedCodexCredentials: async () => {
    refreshCalls.push("codex");
    return undefined;
  },
  refreshLinkedClaudeCodeCredentials: async () => {
    refreshCalls.push("claude-code");
    return undefined;
  },
}));

const { connectLinkedProvider, refreshLinkedAccounts } = await import(
  "./connect"
);

describe("linked provider connection helpers", () => {
  it("connects and activates a ready provider", async () => {
    const context = {
      runtime: {
        setSetting: () => {},
        getSetting: () => undefined,
      },
      config: {
        claudeCodeCliFallback: true,
      },
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "codex",
              model: "",
              baseUrl: "",
            },
          }),
          set: () => {},
        },
      },
    } as unknown as AgentExecutionContext;

    const result = await connectLinkedProvider(context, "codex");

    expect(result.connected).toBe(true);
    expect(result.activated).toBe(true);
    expect(result.providerState?.provider).toBe("codex");
    expect(resolveCalls).toEqual(["codex"]);
  });

  it("refreshes all provider credentials when requested", async () => {
    refreshCalls.length = 0;
    await refreshLinkedAccounts("all");
    expect(refreshCalls).toEqual(["codex", "claude-code"]);
  });
});

import { describe, expect, it } from "bun:test";
import type { AppContext } from "../packages/agent/src/runtime/bootstrap";
import type {
  LinkedProviderAccountsSnapshot,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
} from "../packages/agent/src/runtime/native/account-auth/types";
import { runSmokeChecks } from "./smoke-linked-providers";

type SettingsBag = {
  model: {
    provider: string;
    model: string;
    baseUrl?: string;
    temperature: number;
    maxTokens: number;
  };
};

type SmokeContext = Pick<AppContext, "services" | "runtime">;

function createAdvice(
  provider: LinkedProviderName,
): LinkedProviderConnectAdvice {
  return {
    provider,
    ready: true,
    preferredAction: "use",
    detail: `${provider} connected`,
    status: {
      provider,
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      detail: `${provider} status`,
    },
  };
}

function createContext(): SmokeContext & {
  setCalls: Array<{ key: string; value: unknown }>;
} {
  const settingsBefore: SettingsBag = {
    model: {
      provider: "openai",
      model: "gpt-5",
      baseUrl: "https://example.local/v1",
      temperature: 0.4,
      maxTokens: 1024,
    },
  };
  const currentSettings = structuredClone(settingsBefore);
  const setCalls: Array<{ key: string; value: unknown }> = [];
  const settings = {
    get: () => structuredClone(currentSettings),
    set: (key: string, value: unknown) => {
      setCalls.push({ key, value });
      const [_, field] = key.split(".");
      if (field === "provider")
        currentSettings.model.provider = value as string;
      if (field === "model") currentSettings.model.model = value as string;
      if (field === "baseUrl") currentSettings.model.baseUrl = value as string;
      if (field === "temperature")
        currentSettings.model.temperature = value as number;
      if (field === "maxTokens")
        currentSettings.model.maxTokens = value as number;
    },
  };

  return {
    settingsBefore,
    services: { settings },
    runtime: {
      getService: <T>(name: string) => {
        if (name === "claude_code") {
          return {
            runtimeCredentials: () => ({
              provider: "claude_code",
              upstreamProvider: "anthropic",
            }),
            generateText: async () => "  LINKED_PROVIDER_OK  ",
          } as T;
        }
        return {
          runtimeCredentials: () => ({
            provider: "codex",
            upstreamProvider: "openai-codex",
          }),
          generateText: async () => "  LINKED_PROVIDER_OK  ",
        } as T;
      },
    },
    setCalls,
  } as unknown as SmokeContext & {
    settingsBefore: SettingsBag;
    setCalls: Array<{ key: string; value: unknown }>;
  };
}

function createSnapshot(): LinkedProviderAccountsSnapshot {
  return {
    codex: {
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      detail: "codex detail",
    },
    claudeCode: {
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      detail: "claude detail",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: false,
      reusable: false,
      detail: "eliza detail",
    },
  };
}

describe("smoke-linked-providers", () => {
  it("respects provider filter, maps service type, and skips connect for non-reusable providers", async () => {
    const context = createContext();
    const snapshot = {
      ...createSnapshot(),
      codex: { ...createSnapshot().codex, reusable: false },
    };

    const connectCalls: LinkedProviderName[] = [];
    const results = await runSmokeChecks(
      {
        provider: "all",
        live: false,
        json: true,
        prompt: "Reply with the exact phrase LINKED_PROVIDER_OK",
      },
      {
        getContext: async () => context as never,
        getSnapshot: () => snapshot,
        connect: async (_ctx: SmokeContext, provider: LinkedProviderName) => {
          connectCalls.push(provider);
          return {
            provider,
            connected: true,
            activated: true,
            advice: createAdvice(provider),
            accounts: snapshot,
          };
        },
        syncSettings: () => void 0,
      },
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.provider).toBe("codex");
    expect(results[0]?.connected).toBeUndefined();
    expect(results[0]?.activated).toBe(false);
    expect(results[1]?.provider).toBe("claude-code");
    expect(results[1]?.connected).toBe(true);
    expect(connectCalls).toEqual(["claude-code"]);
    expect(context.setCalls).toHaveLength(5);
  });

  it("normalizes live responses when live mode is enabled", async () => {
    const context = createContext();
    const snapshot = createSnapshot();
    const results = await runSmokeChecks(
      {
        provider: "claude-code",
        live: true,
        json: false,
        prompt: "LINKED_PROVIDER_OK",
      },
      {
        getContext: async () => context as never,
        getSnapshot: () => snapshot,
        connect: async () => ({
          provider: "claude-code" as const,
          connected: true,
          activated: false,
          advice: createAdvice("claude-code"),
          accounts: snapshot,
        }),
        syncSettings: () => void 0,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.serviceType).toBe("claude_code");
    expect(results[0]?.liveResponse).toBe("LINKED_PROVIDER_OK");
    expect(results[0]?.runtimeCredentials).toEqual({
      provider: "claude_code",
      upstreamProvider: "anthropic",
    });
  });

  it("restores settings and still surfaces connect errors", async () => {
    const context = createContext();
    const snapshot = createSnapshot();
    const deps = {
      getContext: async () => context as never,
      getSnapshot: () => snapshot,
      connect: async () => {
        throw new Error("connect failed");
      },
      syncSettings: () => void 0,
    };

    await expect(
      runSmokeChecks(
        {
          provider: "codex",
          live: false,
          json: true,
          prompt: "LINKED_PROVIDER_OK",
        },
        deps,
      ),
    ).rejects.toThrow("connect failed");
    expect(context.setCalls).toHaveLength(5);
  });
});

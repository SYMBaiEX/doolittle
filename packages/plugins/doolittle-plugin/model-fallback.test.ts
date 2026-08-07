import { type IAgentRuntime, ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  createDeterministicOfflineEmbedding,
  createOfflineBootstrapEmbeddingModel,
  createOfflineBootstrapTextModel,
} from "./model-fallback";
import type { DoolittlePluginConfig } from "./types";

function createConfig(
  overrides: Partial<DoolittlePluginConfig> = {},
): DoolittlePluginConfig {
  return {
    dataDir: "/tmp/doolittle-data",
    workspaceDir: "/tmp/doolittle-workspace",
    ...overrides,
  };
}

describe("createOfflineBootstrapTextModel", () => {
  it("proxies the selected provider through the public SDK API", async () => {
    const model = createOfflineBootstrapTextModel(ModelType.TEXT_LARGE);
    const runtime = {
      getSetting: (key: string) =>
        key === "runtimeSettings"
          ? JSON.stringify({ model: { provider: "openai" } })
          : undefined,
      useModel: async (
        modelType: string,
        params: { prompt: string },
        provider: string,
      ) => {
        expect(modelType).toBe(ModelType.TEXT_LARGE);
        expect(params.prompt).toBe("hello world from the prompt");
        expect(provider).toBe("openai");
        return "provider response";
      },
    } as unknown as IAgentRuntime;

    const result = await model(runtime, {
      prompt: "hello world from the prompt",
    } as never);

    expect(result).toBe("provider response");
  });

  it("resolves linked-account providers to their registered plugin identity", async () => {
    const model = createOfflineBootstrapTextModel(ModelType.TEXT_LARGE);
    const runtime = {
      getSetting: () => JSON.stringify({ model: { provider: "claude-code" } }),
      useModel: async (
        _modelType: string,
        _params: unknown,
        provider: string,
      ) => provider,
    } as unknown as IAgentRuntime;

    await expect(model(runtime, { prompt: "hello" })).resolves.toBe(
      "@doolittle/plugin-claude-code",
    );
  });

  it("returns an actionable local response when the provider is unreachable", async () => {
    const model = createOfflineBootstrapTextModel(ModelType.TEXT_SMALL);
    const runtime = {
      getSetting: (key: string) =>
        key === "runtimeSettings"
          ? JSON.stringify({ model: { provider: "anthropic" } })
          : undefined,
      useModel: async () => {
        throw new Error("provider error containing a secret");
      },
    } as unknown as IAgentRuntime;

    const result = await model(runtime, {
      prompt: "keep my request",
    } as never);

    expect(result).toContain("local runtime is ready");
    expect(result).toContain("Reconnect anthropic");
    expect(result).toContain("keep my request");
    expect(result).not.toContain("secret");
  });

  it("skips Ollama generation retries when its local endpoint is offline", async () => {
    const originalFetch = globalThis.fetch;
    let modelCalls = 0;
    globalThis.fetch = (() =>
      Promise.reject(
        new Error("local endpoint unavailable"),
      )) as unknown as typeof globalThis.fetch;

    try {
      const model = createOfflineBootstrapTextModel(ModelType.TEXT_SMALL);
      const runtime = {
        getSetting: (key: string) =>
          key === "runtimeSettings"
            ? JSON.stringify({
                model: {
                  provider: "ollama",
                  baseUrl: "http://localhost:11434/api",
                },
              })
            : undefined,
        useModel: async () => {
          modelCalls += 1;
          return "should not run";
        },
      } as unknown as IAgentRuntime;

      const result = await model(runtime, { prompt: "stay responsive" });

      expect(modelCalls).toBe(0);
      expect(result).toContain("Reconnect ollama");
      expect(result).toContain("stay responsive");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("createOfflineBootstrapEmbeddingModel", () => {
  it("proxies the preferred real embedding handler when it is available", async () => {
    const model = createOfflineBootstrapEmbeddingModel(createConfig());
    const runtime = {
      getSetting: (key: string) =>
        key === "runtimeSettings"
          ? JSON.stringify({ model: { provider: "ollama" } })
          : undefined,
      useModel: async (
        modelType: string,
        params: { text: string },
        provider: string,
      ) => {
        expect(modelType).toBe(ModelType.TEXT_EMBEDDING);
        expect(params).toEqual({ text: "hello" });
        expect(provider).toBe("ollama");
        return [0.25, 0.75];
      },
    } as unknown as IAgentRuntime;

    await expect(model(runtime, { text: "hello" })).resolves.toEqual([
      0.25, 0.75,
    ]);
  });

  it("uses a deterministic local vector when the real provider is unreachable", async () => {
    const model = createOfflineBootstrapEmbeddingModel(createConfig());
    const runtime = {
      getSetting: (key: string) =>
        key === "runtimeSettings"
          ? JSON.stringify({ model: { provider: "ollama" } })
          : undefined,
      useModel: async () => {
        throw new Error("provider error containing a secret");
      },
    } as unknown as IAgentRuntime;

    await expect(model(runtime, null)).resolves.toEqual(
      createDeterministicOfflineEmbedding(null, createConfig()),
    );
  });
});

describe("createDeterministicOfflineEmbedding", () => {
  it("is deterministic, normalized, and honors configured cloud dimensions", () => {
    const config = createConfig({ elizaCloudEmbeddingDimensions: 3 });
    const first = createDeterministicOfflineEmbedding(
      { text: "hello" },
      config,
    );
    const second = createDeterministicOfflineEmbedding("hello", config);
    const magnitude = Math.sqrt(
      first.reduce((sum, value) => sum + value * value, 0),
    );

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.some((value) => value !== 0)).toBe(true);
    expect(magnitude).toBeCloseTo(1, 12);
  });

  it("uses the Ollama-compatible default dimension", () => {
    expect(
      createDeterministicOfflineEmbedding(null, createConfig()),
    ).toHaveLength(768);
  });
});

import { describe, expect, it } from "bun:test";
import {
  type IAgentRuntime,
  ModelType,
  type PipelineHookSpec,
  type Plugin,
} from "@elizaos/core";
import type { EnvConfig } from "@/types";
import {
  createDoolittleOllamaUxPlugin,
  createOllamaEmbeddingOnlyPlugin,
} from "./local-ollama";

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    ollamaApiEndpoint: "http://localhost:11434/api",
    ollamaSmallModel: "granite4.1:3b",
    ollamaLargeModel: "granite4.1:3b",
    ollamaEmbeddingModel: "nomic-embed-text:latest",
    openAiTemperature: 0.4,
    openAiMaxTokens: 1200,
    ...overrides,
  } as EnvConfig;
}

describe("createDoolittleOllamaUxPlugin", () => {
  it("keeps official Ollama model handlers primary", () => {
    const plugin = createDoolittleOllamaUxPlugin(createConfig());

    expect(plugin.models?.[ModelType.TEXT_LARGE]).toBeUndefined();
    expect(plugin.models?.[ModelType.TEXT_SMALL]).toBeUndefined();
    expect(plugin.models?.[ModelType.ACTION_PLANNER]).toBeUndefined();
    expect(plugin.models?.[ModelType.TEXT_EMBEDDING]).toBeUndefined();
  });

  it("bridges model slots that the installed SDK plugin does not expose", async () => {
    const calls: Array<{
      modelType: string;
      params: unknown;
      provider?: string;
    }> = [];
    const plugin = createDoolittleOllamaUxPlugin(createConfig());
    const runtime = {
      useModel: async (
        modelType: string,
        params: unknown,
        provider?: string,
      ) => {
        calls.push({ modelType, params, provider });
        return "delegated";
      },
    } as unknown as IAgentRuntime;

    const params = { prompt: "finish this" };
    await expect(
      plugin.models?.[ModelType.TEXT_COMPLETION]?.(runtime, params),
    ).resolves.toBe("delegated");

    expect(calls).toEqual([
      {
        modelType: ModelType.TEXT_LARGE,
        params,
        provider: "ollama",
      },
    ]);
  });

  it("caps Ollama hidden planning budgets through a pre-model hook", async () => {
    const hooks: PipelineHookSpec[] = [];
    const plugin = createDoolittleOllamaUxPlugin(createConfig());
    const runtime = {
      getSetting: () => undefined,
      registerPipelineHook: (hook: PipelineHookSpec) => hooks.push(hook),
      unregisterPipelineHook: () => undefined,
    } as unknown as IAgentRuntime;

    await plugin.init?.({}, runtime);
    const preModelHook = hooks.find((hook) => hook.phase === "pre_model");
    expect(preModelHook).toBeDefined();

    const params = { prompt: "choose the next action", maxTokens: 1200 };
    await preModelHook?.handler(runtime, {
      phase: "pre_model",
      provider: "ollama",
      requestedModelType: ModelType.ACTION_PLANNER,
      resolvedModelKey: ModelType.ACTION_PLANNER,
      params,
    });

    expect(params.maxTokens).toBe(160);
  });

  it("leaves non-Ollama model calls untouched", async () => {
    const hooks: PipelineHookSpec[] = [];
    const plugin = createDoolittleOllamaUxPlugin(createConfig());
    const runtime = {
      getSetting: () => undefined,
      registerPipelineHook: (hook: PipelineHookSpec) => hooks.push(hook),
      unregisterPipelineHook: () => undefined,
    } as unknown as IAgentRuntime;

    await plugin.init?.({}, runtime);
    const preModelHook = hooks.find((hook) => hook.phase === "pre_model");
    const params = { prompt: "hello", maxTokens: 1200 };
    await preModelHook?.handler(runtime, {
      phase: "pre_model",
      provider: "openai",
      requestedModelType: ModelType.ACTION_PLANNER,
      resolvedModelKey: ModelType.ACTION_PLANNER,
      params,
    });

    expect(params.maxTokens).toBe(1200);
  });
});

describe("createOllamaEmbeddingOnlyPlugin", () => {
  it("filters the official Ollama plugin down to the embedding model", async () => {
    const embeddingHandler = async () => [0.1, 0.2, 0.3];
    const officialPlugin = {
      name: "ollama",
      description: "Official Ollama plugin",
      config: {
        OLLAMA_API_ENDPOINT: "http://localhost:11434/api",
      },
      init: () => undefined,
      models: {
        [ModelType.TEXT_EMBEDDING]: embeddingHandler,
        [ModelType.TEXT_LARGE]: async () => "text",
      },
    } as unknown as Plugin;

    const plugin = createOllamaEmbeddingOnlyPlugin(officialPlugin);

    expect(plugin.name).toBe("ollama");
    expect(plugin.config).toEqual(officialPlugin.config);
    expect(plugin.init).toBe(officialPlugin.init);
    expect(plugin.models?.[ModelType.TEXT_LARGE]).toBeUndefined();
    await expect(
      plugin.models?.[ModelType.TEXT_EMBEDDING]?.({} as IAgentRuntime, "hello"),
    ).resolves.toEqual([0.1, 0.2, 0.3]);
  });
});

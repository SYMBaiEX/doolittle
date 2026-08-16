import { ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "@/types/runtime";
import {
  ensureDoolittleDirectApiPlugins,
  loadProviderPlugins,
} from "./providers";

function config(): EnvConfig {
  return {
    ollamaApiEndpoint: "http://127.0.0.1:11434/api",
    claudeCodeCliFallback: true,
    devinCliCommand: "devin",
    devinModel: "devin-latest",
    devinTimeoutMs: 120_000,
    workspaceDir: "/workspace",
    elizaCloudEmbeddingUrl: "",
    elizaCloudEmbeddingApiKey: "",
  } as EnvConfig;
}

describe("loadProviderPlugins", () => {
  it("keeps switchable model providers registered across initial selections", async () => {
    const firstAssembly = await loadProviderPlugins(config());
    const secondAssembly = await loadProviderPlugins(config());
    const switchableNames = [
      "codex-cli",
      "anthropic",
      "@doolittle/plugin-claude-code",
      "@doolittle/plugin-devin",
      "elizaOSCloud",
      "ollama",
    ];

    expect(firstAssembly.map((plugin) => plugin.name)).toEqual(
      expect.arrayContaining(switchableNames),
    );
    expect(secondAssembly.map((plugin) => plugin.name)).toEqual(
      expect.arrayContaining(switchableNames),
    );
    for (const name of switchableNames) {
      expect(
        firstAssembly.find((plugin) => plugin.name === name)?.models,
      ).toBeDefined();
      expect(
        secondAssembly.find((plugin) => plugin.name === name)?.models,
      ).toBeDefined();
    }
  });

  it("exposes the official Eliza Cloud research and media model surface", async () => {
    const providers = await loadProviderPlugins(config());
    const cloud = providers.find((plugin) => plugin.name === "elizaOSCloud");

    expect(cloud?.models?.[ModelType.RESEARCH]).toBeTypeOf("function");
    expect(cloud?.models?.[ModelType.IMAGE]).toBeTypeOf("function");
    expect(cloud?.models?.[ModelType.IMAGE_DESCRIPTION]).toBeTypeOf("function");
    expect(cloud?.models?.[ModelType.TEXT_TO_SPEECH]).toBeTypeOf("function");
    expect(cloud?.models?.[ModelType.TEXT_EMBEDDING]).toBeUndefined();
    expect(cloud?.services?.length).toBeGreaterThan(1);
    expect(cloud?.providers?.length).toBeGreaterThan(1);
  });

  it("uses the official Codex plugin for native text, response, and planning models", async () => {
    const providers = await loadProviderPlugins(config());
    const codex = providers.find((plugin) => plugin.name === "codex-cli");

    expect(codex?.models?.[ModelType.TEXT_SMALL]).toBeTypeOf("function");
    expect(codex?.models?.[ModelType.RESPONSE_HANDLER]).toBeTypeOf("function");
    expect(codex?.models?.[ModelType.ACTION_PLANNER]).toBeTypeOf("function");
    expect(codex?.services).toBeUndefined();
    expect(codex?.description).toContain("Codex");
  });

  it("uses the official Anthropic plugin for linked OAuth, tools, and planning", async () => {
    const providers = await loadProviderPlugins(config());
    const anthropic = providers.find((plugin) => plugin.name === "anthropic");

    expect(anthropic?.models?.[ModelType.TEXT_LARGE]).toBeTypeOf("function");
    expect(anthropic?.models?.[ModelType.RESPONSE_HANDLER]).toBeTypeOf(
      "function",
    );
    expect(anthropic?.models?.[ModelType.ACTION_PLANNER]).toBeTypeOf(
      "function",
    );
  });

  it("registers OpenAI when the native account pool materializes an API key", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "pool-materialized-key";
    try {
      const providers = await loadProviderPlugins(config());
      expect(
        providers.find((plugin) => plugin.name === "openai"),
      ).toBeDefined();
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it("hot-loads OpenAI when a direct account arrives after bootstrap", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "pool-materialized-key";
    const registerPlugin = vi.fn().mockResolvedValue(undefined);
    try {
      await ensureDoolittleDirectApiPlugins({
        plugins: [],
        registerPlugin,
      });
      expect(registerPlugin).toHaveBeenCalledOnce();
      expect(registerPlugin.mock.calls[0]?.[0]).toMatchObject({
        name: "openai",
      });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it("enables official cloud embeddings only when cloud embedding ownership is selected", async () => {
    const cloudConfig = config();
    cloudConfig.elizaCloudEmbeddingApiKey = "configured";
    const providers = await loadProviderPlugins(cloudConfig);
    const cloud = providers.find((plugin) => plugin.name === "elizaOSCloud");

    expect(cloud?.models?.[ModelType.TEXT_EMBEDDING]).toBeTypeOf("function");
    expect(cloud?.models?.[ModelType.TEXT_EMBEDDING_BATCH]).toBeTypeOf(
      "function",
    );
  });
});

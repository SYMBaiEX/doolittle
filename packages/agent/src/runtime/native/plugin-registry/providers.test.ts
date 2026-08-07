import { ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { EnvConfig } from "@/types/runtime";
import { loadProviderPlugins } from "./providers";

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
      "@doolittle/plugin-codex",
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

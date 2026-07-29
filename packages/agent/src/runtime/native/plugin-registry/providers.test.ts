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
      "@elizaos/plugin-codex",
      "@elizaos/plugin-claude-code",
      "@elizaos/plugin-devin",
      "@elizaos/plugin-elizacloud",
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
});

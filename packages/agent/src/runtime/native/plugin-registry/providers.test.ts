import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import { loadProviderPlugins } from "./providers";

function servicesWithProvider(provider: string): AppServices {
  return {
    settings: {
      get: () => ({
        model: { provider },
      }),
    },
  } as unknown as AppServices;
}

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
    const fromOllama = await loadProviderPlugins(
      servicesWithProvider("ollama"),
      config(),
    );
    const fromClaude = await loadProviderPlugins(
      servicesWithProvider("claude-code"),
      config(),
    );
    const switchableNames = [
      "@elizaos/plugin-codex",
      "@elizaos/plugin-claude-code",
      "@elizaos/plugin-devin",
      "@elizaos/plugin-elizacloud",
      "ollama",
    ];

    expect(fromOllama.map((plugin) => plugin.name)).toEqual(
      expect.arrayContaining(switchableNames),
    );
    expect(fromClaude.map((plugin) => plugin.name)).toEqual(
      expect.arrayContaining(switchableNames),
    );
    for (const name of switchableNames) {
      expect(fromOllama.find((plugin) => plugin.name === name)?.models).toBeDefined();
      expect(fromClaude.find((plugin) => plugin.name === name)?.models).toBeDefined();
    }
  });
});

import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@doolittle/agent/plugin-api";
import type { IAgentRuntime } from "@elizaos/core";
import {
  createOpenAiBackedTextModel,
  hasConfiguredModelProvider,
} from "./model-fallback";

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    dataDir: "/tmp/doolittle-data",
    workspaceDir: "/tmp/doolittle-workspace",
    discordBotToken: "",
    telegramBotToken: "",
    falApiKey: "",
    openAiApiKey: "",
    ...overrides,
  } as EnvConfig;
}

describe("hasConfiguredModelProvider", () => {
  it("detects configured direct and linked model providers", () => {
    expect(hasConfiguredModelProvider(createConfig())).toBe(false);
    expect(
      hasConfiguredModelProvider(createConfig({ openAiApiKey: "key" })),
    ).toBe(true);
    expect(
      hasConfiguredModelProvider(
        createConfig({ useLinkedCodexAuth: true, openAiApiKey: "" }),
      ),
    ).toBe(true);
    expect(
      hasConfiguredModelProvider(
        createConfig({ elizaCloudEnabled: true, elizaCloudApiKey: "key" }),
      ),
    ).toBe(true);
  });
});

describe("createOpenAiBackedTextModel", () => {
  it("falls back to an offline bootstrap response when no API key is set", async () => {
    const model = createOpenAiBackedTextModel(createConfig());
    const runtime = {
      getSetting: () => undefined,
    } as unknown as IAgentRuntime;

    const result = await model(runtime, {
      prompt: "hello world from the prompt",
    } as never);

    expect(result).toContain("offline bootstrap mode");
    expect(result).toContain("hello world from the prompt");
  });
});

import { describe, expect, it } from "vitest";
import { describeAutonomousAlignment } from "../../packages/agent/src/runtime/native/autonomous-stack";
import type { EnvConfig } from "../../packages/agent/src/types/runtime";

const config = (values: Partial<EnvConfig>): EnvConfig => values as EnvConfig;

describe("runtime connection diagnostics", () => {
  it.each([
    [
      { useLinkedCodexAuth: true, openAiModel: "coding-model" },
      "openai-subscription",
      "coding-model",
    ],
    [
      { useLinkedClaudeCodeAuth: true, anthropicLargeModel: "claude-model" },
      "anthropic-subscription",
      "claude-model",
    ],
    [
      { claudeCodeCliFallback: true, anthropicLargeModel: "fallback-model" },
      "anthropic-subscription",
      "fallback-model",
    ],
    [
      { useLinkedDevinAuth: true, devinModel: "devin-model" },
      "devin",
      "devin-model",
    ],
    [
      {
        ollamaApiEndpoint: "http://localhost:11434",
        ollamaLargeModel: "local-model",
      },
      "ollama",
      "local-model",
    ],
    [
      { openAiApiKey: "private-key", openAiModel: "api-model" },
      "configured",
      "api-model",
    ],
  ] as const)(
    "reports the selected connection without a legacy config",
    (values, provider, primaryModel) => {
      expect(
        describeAutonomousAlignment(config(values)).connection,
      ).toMatchObject({ configured: true, provider, primaryModel });
    },
  );

  it("reports cloud precedence and enabled connectors without copying credentials", () => {
    const result = describeAutonomousAlignment(
      config({
        elizaCloudEnabled: true,
        elizaCloudApiKey: "private-cloud-key",
        elizaCloudSmallModel: "small",
        elizaCloudLargeModel: "large",
        useLinkedCodexAuth: true,
        telegramBotToken: "private-telegram-token",
        discordBotToken: "private-discord-token",
      }),
    );
    expect(result.connection).toMatchObject({
      kind: "cloud-managed",
      smallModel: "small",
      largeModel: "large",
    });
    expect(result.pluginAutoEnable.allow).toEqual([
      "@elizaos/plugin-telegram",
      "@elizaos/plugin-discord",
      "@elizaos/plugin-elizacloud",
    ]);
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  it("reports missing configuration without inventing a connection", () => {
    for (const values of [undefined, config({})]) {
      expect(describeAutonomousAlignment(values).connection).toMatchObject({
        configured: false,
        kind: "missing",
      });
      expect(
        describeAutonomousAlignment(values).pluginAutoEnable.allow,
      ).toEqual([]);
    }
  });
});

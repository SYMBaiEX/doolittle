import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types/runtime";
import {
  buildAutonomousCompatConfig,
  buildAutonomousCompatEnv,
  buildAutonomousCompatSnapshot,
  describeAutonomousAlignment,
  summarizeAutonomousConnection,
} from "./autonomous-stack";

describe("autonomous stack", () => {
  it("builds compat env/config for cloud-managed native onboarding", () => {
    const config = {
      elizaCloudEnabled: true,
      elizaCloudApiKey: "cloud-key",
      elizaCloudSmallModel: "anthropic/claude-haiku-4-5-20251001",
      elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
      telegramBotToken: "tg-token",
      discordBotToken: "discord-token",
      useLinkedCodexAuth: false,
      useLinkedClaudeCodeAuth: false,
      claudeCodeCliFallback: false,
      openAiApiKey: undefined,
      anthropicApiKey: undefined,
      openAiModel: "gpt-5.4",
      anthropicLargeModel: "claude-sonnet-4.6",
    } as EnvConfig;

    expect(buildAutonomousCompatEnv(config)).toMatchObject({
      ELIZAOS_CLOUD_API_KEY: "cloud-key",
      ELIZAOS_CLOUD_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "tg-token",
      DISCORD_BOT_TOKEN: "discord-token",
    });
    expect(buildAutonomousCompatConfig(config)).toMatchObject({
      cloud: {
        enabled: true,
        provider: "elizacloud",
      },
      models: {
        small: "anthropic/claude-haiku-4-5-20251001",
        large: "anthropic/claude-sonnet-4.6",
      },
    });
  });

  it("reports alignment and cloud-managed connection details from the split modules", () => {
    const config = {
      elizaCloudEnabled: true,
      elizaCloudApiKey: "cloud-key",
      elizaCloudSmallModel: "anthropic/claude-haiku-4-5-20251001",
      elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
      elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
      useLinkedCodexAuth: false,
      useLinkedClaudeCodeAuth: false,
      claudeCodeCliFallback: false,
      openAiApiKey: undefined,
      anthropicApiKey: undefined,
      openAiModel: "gpt-5.4",
      anthropicLargeModel: "claude-sonnet-4.6",
      telegramBotToken: undefined,
      discordBotToken: undefined,
      falApiKey: undefined,
    } as EnvConfig;

    expect(summarizeAutonomousConnection(config)).toMatchObject({
      configured: true,
      kind: "cloud-managed",
      provider: "elizacloud",
      smallModel: "anthropic/claude-haiku-4-5-20251001",
      largeModel: "anthropic/claude-sonnet-4.6",
    });
    expect(describeAutonomousAlignment(config)).toMatchObject({
      foundationPackages: [
        "@elizaos/agent",
        "@elizaos/autonomous",
        "@elizaos/skills",
      ],
      connection: {
        kind: "cloud-managed",
        provider: "elizacloud",
      },
    });
  });

  it("builds one compat snapshot for linked Codex auth and reuses it across alignment views", () => {
    const config = {
      useLinkedCodexAuth: true,
      useLinkedClaudeCodeAuth: false,
      claudeCodeCliFallback: false,
      openAiApiKey: undefined,
      anthropicApiKey: undefined,
      openAiModel: "gpt-5.4",
      anthropicLargeModel: "claude-sonnet-4.6",
      elizaCloudEnabled: false,
      elizaCloudApiKey: undefined,
      elizaCloudSmallModel: undefined,
      elizaCloudLargeModel: undefined,
      telegramBotToken: undefined,
      discordBotToken: undefined,
    } as unknown as EnvConfig;

    expect(buildAutonomousCompatSnapshot(config)).toMatchObject({
      config: {
        agents: {
          defaults: {},
        },
      },
      pluginAutoEnable: {
        allow: expect.any(Array),
        changes: expect.any(Array),
      },
    });
    expect(summarizeAutonomousConnection(config)).toMatchObject({
      configured: true,
      kind: "local-provider",
      provider: "openai-subscription",
    });
    expect(describeAutonomousAlignment(config)).toMatchObject({
      nativeControlPlanes: expect.arrayContaining([
        "agent-orchestrator",
        "autocoder",
        "tts",
      ]),
      connection: {
        kind: "local-provider",
        provider: "openai-subscription",
      },
    });
  });
});

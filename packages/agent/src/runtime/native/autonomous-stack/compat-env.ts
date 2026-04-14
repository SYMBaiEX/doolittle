import type { EnvConfig } from "@/types/runtime";

export function buildAutonomousCompatEnv(config: EnvConfig): NodeJS.ProcessEnv {
  return {
    ...(config.elizaCloudApiKey
      ? {
          ELIZAOS_CLOUD_API_KEY: config.elizaCloudApiKey,
        }
      : {}),
    ...(config.elizaCloudEnabled
      ? {
          ELIZAOS_CLOUD_ENABLED: "true",
        }
      : {}),
    ...(config.openAiApiKey
      ? {
          OPENAI_API_KEY: config.openAiApiKey,
        }
      : {}),
    ...(config.anthropicApiKey
      ? {
          ANTHROPIC_API_KEY: config.anthropicApiKey,
        }
      : {}),
    ...(config.telegramBotToken
      ? {
          TELEGRAM_BOT_TOKEN: config.telegramBotToken,
        }
      : {}),
    ...(config.discordBotToken
      ? {
          DISCORD_BOT_TOKEN: config.discordBotToken,
        }
      : {}),
  };
}

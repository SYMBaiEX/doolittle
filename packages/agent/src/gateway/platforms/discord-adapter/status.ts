import type { EnvConfig } from "@/types/runtime";
import type { MessagingPlatformState } from "../messaging-state";

export const DISCORD_CONFIGURED_DETAIL =
  "Discord bot token configured; replies, threads, and attachments are supported.";
export const DISCORD_MISSING_DETAIL = "DISCORD_BOT_TOKEN is not configured.";
export const DISCORD_STARTED_DETAIL =
  "Discord adapter started with configured bot token.";
export const DISCORD_STOP_DETAIL = "DISCORD_BOT_TOKEN is not configured.";
export const DISCORD_STOPPED_DETAIL = "Discord adapter stopped.";

export function isDiscordConfigured(config: EnvConfig): boolean {
  return Boolean(config.discordBotToken);
}

export function requireDiscordBotToken(
  config: EnvConfig,
  state: MessagingPlatformState,
): string {
  if (!config.discordBotToken) {
    state.fail(DISCORD_MISSING_DETAIL);
  }

  return config.discordBotToken;
}

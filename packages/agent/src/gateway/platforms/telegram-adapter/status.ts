import type { EnvConfig } from "@/types/runtime";
import type { MessagingPlatformState } from "../messaging-state";

export const TELEGRAM_CONFIGURED_DETAIL =
  "Telegram token configured; replies and threaded session routing are enabled.";
export const TELEGRAM_MISSING_DETAIL = "TELEGRAM_BOT_TOKEN is not configured.";
export const TELEGRAM_STARTED_DETAIL =
  "Telegram adapter started with configured bot token.";
export const TELEGRAM_STOP_DETAIL = "TELEGRAM_BOT_TOKEN is not configured.";
export const TELEGRAM_STOPPED_DETAIL = "Telegram adapter stopped.";

export function getTelegramApiRoot(config: EnvConfig): string {
  return config.telegramApiRoot ?? "https://api.telegram.org";
}

export function isTelegramConfigured(config: EnvConfig): boolean {
  return Boolean(config.telegramBotToken);
}

export function requireTelegramBotToken(
  config: EnvConfig,
  state: MessagingPlatformState,
): string {
  if (!config.telegramBotToken) {
    state.fail(TELEGRAM_MISSING_DETAIL);
  }

  return config.telegramBotToken;
}

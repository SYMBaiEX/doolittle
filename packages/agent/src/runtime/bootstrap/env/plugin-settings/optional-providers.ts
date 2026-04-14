import type { EnvConfig, PluginSettings } from "./types";

export function applyOptionalProviderSettings(
  settings: PluginSettings,
  config: EnvConfig,
): void {
  if (config.anthropicBaseUrl) {
    settings.ANTHROPIC_BASE_URL = config.anthropicBaseUrl;
  }

  if (config.falApiKey) {
    settings.FAL_API_KEY = config.falApiKey;
  }

  if (config.telegramBotToken) {
    settings.TELEGRAM_BOT_TOKEN = config.telegramBotToken;
  }

  if (config.telegramApiRoot) {
    settings.TELEGRAM_API_ROOT = config.telegramApiRoot;
  }

  if (config.telegramAllowedChats) {
    settings.TELEGRAM_ALLOWED_CHATS = config.telegramAllowedChats;
  }
}

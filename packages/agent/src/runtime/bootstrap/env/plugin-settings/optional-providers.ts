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

  if (config.discordBotToken) {
    settings.DISCORD_API_TOKEN = config.discordBotToken;
  }

  if (config.discordApplicationId) {
    settings.DISCORD_APPLICATION_ID = config.discordApplicationId;
  }

  if (config.slackBotToken && config.slackAppToken) {
    settings.SLACK_BOT_TOKEN = config.slackBotToken;
    settings.SLACK_APP_TOKEN = config.slackAppToken;
  }

  if (config.slackSigningSecret) {
    settings.SLACK_SIGNING_SECRET = config.slackSigningSecret;
  }

  if (config.slackUserToken) {
    settings.SLACK_USER_TOKEN = config.slackUserToken;
  }

  if (
    config.whatsappAccessToken &&
    config.whatsappPhoneNumberId &&
    config.whatsappVerifyToken
  ) {
    settings.WHATSAPP_ACCESS_TOKEN = config.whatsappAccessToken;
    settings.WHATSAPP_PHONE_NUMBER_ID = config.whatsappPhoneNumberId;
    settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN = config.whatsappVerifyToken;
    settings.WHATSAPP_AUTH_METHOD = "cloudapi";
  }

  if (config.whatsappAppSecret) {
    settings.WHATSAPP_APP_SECRET = config.whatsappAppSecret;
  }

  if (config.signalAccountNumber) {
    settings.SIGNAL_ACCOUNT_NUMBER = config.signalAccountNumber;
    if (config.signalHttpUrl) settings.SIGNAL_HTTP_URL = config.signalHttpUrl;
    if (config.signalCliPath) settings.SIGNAL_CLI_PATH = config.signalCliPath;
  }
}

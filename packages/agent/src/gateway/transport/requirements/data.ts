import type { PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";

export interface TransportRequirementDefinition {
  platform: PlatformName;
  label: string;
  requiredAll?: Array<{
    key: string;
    configured: (config: EnvConfig) => boolean;
  }>;
  requiredAny?: Array<{
    key: string;
    configured: (config: EnvConfig) => boolean;
  }>;
}

export const TRANSPORT_REQUIREMENTS: TransportRequirementDefinition[] = [
  {
    platform: "telegram",
    label: "Telegram",
    requiredAll: [
      {
        key: "TELEGRAM_BOT_TOKEN",
        configured: (config) => Boolean(config.telegramBotToken),
      },
    ],
  },
  {
    platform: "discord",
    label: "Discord",
    requiredAll: [
      {
        key: "DISCORD_BOT_TOKEN",
        configured: (config) => Boolean(config.discordBotToken),
      },
    ],
  },
  {
    platform: "slack",
    label: "Slack",
    requiredAll: [
      {
        key: "SLACK_WEBHOOK_URL",
        configured: (config) => Boolean(config.slackWebhookUrl),
      },
      {
        key: "SLACK_SIGNING_SECRET",
        configured: (config) => Boolean(config.slackSigningSecret),
      },
    ],
  },
  {
    platform: "whatsapp",
    label: "WhatsApp",
    requiredAll: [
      {
        key: "WHATSAPP_ACCESS_TOKEN",
        configured: (config) => Boolean(config.whatsappAccessToken),
      },
      {
        key: "WHATSAPP_PHONE_NUMBER_ID",
        configured: (config) => Boolean(config.whatsappPhoneNumberId),
      },
      {
        key: "WHATSAPP_VERIFY_TOKEN",
        configured: (config) => Boolean(config.whatsappVerifyToken),
      },
    ],
  },
  {
    platform: "signal",
    label: "Signal",
    requiredAll: [
      {
        key: "SIGNAL_CLI_COMMAND",
        configured: (config) => Boolean(config.signalCliCommand),
      },
    ],
  },
  {
    platform: "matrix",
    label: "Matrix",
    requiredAll: [
      {
        key: "MATRIX_HOMESERVER",
        configured: (config) => Boolean(config.matrixHomeserver),
      },
      {
        key: "MATRIX_ACCESS_TOKEN",
        configured: (config) => Boolean(config.matrixAccessToken),
      },
    ],
  },
  {
    platform: "email",
    label: "Email",
    requiredAll: [
      {
        key: "EMAIL_SEND_COMMAND",
        configured: (config) => Boolean(config.emailSendCommand),
      },
    ],
  },
  {
    platform: "sms",
    label: "SMS",
    requiredAll: [
      {
        key: "SMS_SEND_COMMAND",
        configured: (config) => Boolean(config.smsSendCommand),
      },
    ],
  },
  {
    platform: "mattermost",
    label: "Mattermost",
    requiredAll: [
      {
        key: "MATTERMOST_URL",
        configured: (config) => Boolean(config.mattermostUrl),
      },
      {
        key: "MATTERMOST_TOKEN",
        configured: (config) => Boolean(config.mattermostToken),
      },
    ],
  },
  {
    platform: "homeassistant",
    label: "Home Assistant",
    requiredAll: [
      {
        key: "HOMEASSISTANT_URL",
        configured: (config) => Boolean(config.homeAssistantUrl),
      },
      {
        key: "HOMEASSISTANT_TOKEN",
        configured: (config) => Boolean(config.homeAssistantToken),
      },
    ],
  },
  {
    platform: "dingtalk",
    label: "DingTalk",
    requiredAny: [
      {
        key: "DINGTALK_WEBHOOK_URL",
        configured: (config) => Boolean(config.dingtalkWebhookUrl),
      },
      {
        key: "DINGTALK_ACCESS_TOKEN",
        configured: (config) => Boolean(config.dingtalkAccessToken),
      },
    ],
  },
];

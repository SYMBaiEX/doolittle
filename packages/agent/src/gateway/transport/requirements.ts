import type { GatewayConfig, PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { TransportRequirementRecord } from "./types";

interface TransportRequirementDefinition {
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

const TRANSPORT_REQUIREMENTS: TransportRequirementDefinition[] = [
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

function buildRequirementSummary(
  definition: TransportRequirementDefinition,
  configuredKeys: string[],
  missingKeys: string[],
): string {
  if (definition.requiredAny?.length) {
    return configuredKeys.length
      ? `${definition.label} transport configured via ${configuredKeys.join(" or ")}.`
      : `${definition.requiredAny.map((entry) => entry.key).join(" or ")} should be configured.`;
  }
  if (!missingKeys.length) {
    return `${definition.label} transport configured.`;
  }
  return `${missingKeys.join(" and ")} ${missingKeys.length === 1 ? "is" : "are"} not configured.`;
}

function buildChecklist(
  definition: TransportRequirementDefinition,
  missingKeys: string[],
): string | null {
  if (!missingKeys.length) {
    return null;
  }
  if (definition.requiredAny?.length) {
    return `Set ${definition.requiredAny.map((entry) => entry.key).join(" or ")} before enabling the ${definition.label} gateway path.`;
  }
  return `Set ${missingKeys.join(", ")} before enabling the ${definition.label} gateway path.`;
}

export function getTransportRequirementRecords(
  config: EnvConfig,
  gatewayConfig: GatewayConfig,
): TransportRequirementRecord[] {
  return TRANSPORT_REQUIREMENTS.map((definition) => {
    const enabled =
      gatewayConfig.platforms[definition.platform]?.enabled ?? false;
    const requiredAll = definition.requiredAll ?? [];
    const requiredAny = definition.requiredAny ?? [];
    const configuredAll = requiredAll.filter((entry) =>
      entry.configured(config),
    );
    const configuredAny = requiredAny.filter((entry) =>
      entry.configured(config),
    );
    const missingAll = requiredAll
      .filter((entry) => !entry.configured(config))
      .map((entry) => entry.key);
    const missingAny = requiredAny
      .filter((entry) => !entry.configured(config))
      .map((entry) => entry.key);
    const configured =
      requiredAny.length > 0
        ? configuredAny.length > 0
        : missingAll.length === 0;
    const missing =
      requiredAny.length > 0 && configured
        ? []
        : requiredAny.length > 0
          ? missingAny
          : missingAll;
    const status: "pass" | "warn" | "fail" = enabled
      ? configured
        ? "pass"
        : "fail"
      : configured
        ? "pass"
        : "warn";

    return {
      platform: definition.platform,
      label: definition.label,
      enabled,
      configured,
      missing,
      mode:
        requiredAny.length > 0
          ? "any"
          : requiredAll.length > 0
            ? "all"
            : "none",
      summary: buildRequirementSummary(
        definition,
        [...configuredAll, ...configuredAny].map((entry) => entry.key),
        missing,
      ),
      checklist: buildChecklist(definition, missing),
      status,
    };
  });
}

export function getTransportRequirementRecord(
  config: EnvConfig,
  gatewayConfig: GatewayConfig,
  platform: PlatformName,
): TransportRequirementRecord | undefined {
  return getTransportRequirementRecords(config, gatewayConfig).find(
    (entry) => entry.platform === platform,
  );
}
